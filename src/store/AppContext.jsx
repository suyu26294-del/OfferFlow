'use client'

import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import { generateMockData, defaultSettings } from './mockData'
import { normalizeScoringConfig } from '../lib/jobScoring'
import { deleteReviewAttachmentsByReviewId } from '../utils/reviewAttachmentStore'
import Toast from '../components/Toast'
import { useAuth } from './AuthContext'

const AppContext = createContext(null)
const ToastContext = createContext(null)

const ROUND_ORDER = ['一面', '二面', '三面', '终面']
const STATUS_ROUND_MAP = { '一面中': '一面', '二面中': '二面', '三面中': '三面', '终面中': '终面' }

// ---- Centralized statistics helpers ----

export const APPLIED_STATUSES = ['已投递', 'OA / 笔试', '一面中', '二面中', '三面中', '终面中', 'Offer', '已结束']
export const REPLIED_STATUSES = ['OA / 笔试', '一面中', '二面中', '三面中', '终面中', 'Offer']
export const INTERVIEW_STATUSES = ['一面中', '二面中', '三面中', '终面中']

export function isAppliedJob(job) {
  return APPLIED_STATUSES.includes(job.status)
}

export function isRepliedJob(job) {
  if (REPLIED_STATUSES.includes(job.status)) return true
  if (job.status === '已结束') {
    if (!job.endReason) return true
    return ['被拒绝', '岗位关闭', '其他'].includes(job.endReason)
  }
  return false
}

export function hasInterviewExperience(job) {
  if (Array.isArray(job.interviewRounds) && job.interviewRounds.length > 0) return true
  return INTERVIEW_STATUSES.includes(job.status) || job.status === 'Offer' || job.status === '已结束'
}

export function getFallbackInterviewRounds(job) {
  if (Array.isArray(job.interviewRounds) && job.interviewRounds.length > 0) return job.interviewRounds
  if (job.status === '一面中') return [{ round: '一面', status: '进行中' }]
  if (job.status === '二面中') return [{ round: '一面', status: '已通过' }, { round: '二面', status: '进行中' }]
  if (job.status === '三面中') return [{ round: '一面', status: '已通过' }, { round: '二面', status: '已通过' }, { round: '三面', status: '进行中' }]
  if (job.status === '终面中') return [{ round: '一面', status: '已通过' }, { round: '二面', status: '已通过' }, { round: '三面', status: '已通过' }, { round: '终面', status: '进行中' }]
  if (job.status === 'Offer') return [{ round: '一面', status: '已通过' }]
  if (job.status === '已结束') return [{ round: '一面', status: '已结束' }]
  return []
}

export function getInterviewRoundCount(job) {
  return getFallbackInterviewRounds(job).length
}

export function isOfferJob(job) {
  return job.status === 'Offer'
}

export function getResumeStats(resumeId, jobs) {
  const linked = jobs.filter((j) => j.resumeId === resumeId)
  const sentCount = linked.filter(isAppliedJob).length
  const replyCount = linked.filter(isRepliedJob).length
  const interviewPeopleCount = linked.filter(hasInterviewExperience).length
  const interviewRoundCount = linked.reduce((sum, j) => sum + getInterviewRoundCount(j), 0)
  const offerCount = linked.filter(isOfferJob).length
  return {
    sentCount, replyCount, interviewPeopleCount, interviewRoundCount, offerCount,
    interviewRate: sentCount > 0 ? Math.round((interviewPeopleCount / sentCount) * 100) : 0,
    offerRate: sentCount > 0 ? Math.round((offerCount / sentCount) * 100) : 0,
  }
}

export function syncInterviewRounds(job) {
  const rounds = [...(job.interviewRounds || [])]
  const status = job.status
  const targetRound = STATUS_ROUND_MAP[status]

  if (targetRound && !rounds.some(r => r.round === targetRound)) {
    rounds.push({
      id: crypto.randomUUID(),
      round: targetRound,
      status: '进行中',
      date: new Date().toISOString().slice(0, 10),
      result: '',
      notes: '',
    })
  }

  if (targetRound && ['二面中', '三面中', '终面中'].includes(status)) {
    const currentIdx = ROUND_ORDER.indexOf(targetRound)
    for (let i = 0; i < currentIdx; i++) {
      const prev = rounds.find(r => r.round === ROUND_ORDER[i])
      if (prev && prev.status === '进行中') {
        prev.status = '已通过'
      }
    }
  }

  if (status === 'Offer') {
    for (let i = ROUND_ORDER.length - 1; i >= 0; i--) {
      const found = rounds.find(r => r.round === ROUND_ORDER[i] && r.status === '进行中')
      if (found) { found.status = '已通过'; break }
    }
  }

  return { ...job, interviewRounds: rounds }
}

function migrateJobs(jobs) {
  return jobs.map((j) => {
    let updated = { ...j }
    if (updated.status === '面试中') {
      updated.status = '一面中'
    }
    return syncInterviewRounds(updated)
  })
}

// ---- API helper ----

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '请求失败')
  return data
}

// ---- localStorage helpers ----

function loadFromStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return fallback
}

function saveToStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch { /* ignore */ }
}

function settingsStorageKey(userId) {
  return userId ? `offerFlow_settings_${userId}` : 'offerFlow_settings'
}

function normalizeSettings(value = {}) {
  const merged = { ...defaultSettings, ...(value || {}) }
  return { ...merged, jobScoring: normalizeScoringConfig(merged) }
}

export function AppProvider({ children }) {
  const { user, loading: authLoading } = useAuth()

  const [jobs, setJobsRaw] = useState([])
  const [resumes, setResumesRaw] = useState([])
  const [tasks, setTasksRaw] = useState([])
  const [reviews, setReviewsRaw] = useState([])
  const [projectDocs, setProjectDocsRaw] = useState([])
  const [settings, setSettingsRaw] = useState(() => {
    if (typeof window === 'undefined') return defaultSettings
    return normalizeSettings(loadFromStorage('offerFlow_settings', defaultSettings))
  })
  const [dataLoading, setDataLoading] = useState(true)
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'success') => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  // ---- Data loading: re-fetch when auth state changes (login/logout) ----
  useEffect(() => {
    if (authLoading) return
    loadAllData()
  }, [user?.id, authLoading])

  async function loadAllData() {
    setDataLoading(true)
    try {
      let [j, r, t, rv, pdocs, remoteSettings] = await Promise.all([
        apiFetch('/api/jobs'),
        apiFetch('/api/resumes'),
        apiFetch('/api/tasks'),
        apiFetch('/api/reviews'),
        apiFetch('/api/project-docs'),
        apiFetch('/api/settings'),
      ])

      setJobsRaw(migrateJobs(j))
      setResumesRaw(r)
      setTasksRaw(t)
      setReviewsRaw(rv)
      setProjectDocsRaw(pdocs)

      const nextSettings = normalizeSettings(remoteSettings || loadFromStorage(settingsStorageKey(user?.id), defaultSettings))
      setSettingsRaw(nextSettings)

      saveToStorage(settingsStorageKey(user?.id), nextSettings)
      saveToStorage('offerFlow_jobs', migrateJobs(j))
      saveToStorage('offerFlow_resumes', r)
      saveToStorage('offerFlow_tasks', t)
      saveToStorage('offerFlow_reviews', rv)
      saveToStorage('offerFlow_projectDocs', pdocs)
    } catch (err) {
      // If unauthorized, just show empty data instead of falling
      // back to a potentially stale localStorage from another user.
      if (err.message === 'Unauthorized') {
        setJobsRaw([])
        setResumesRaw([])
        setTasksRaw([])
        setReviewsRaw([])
        setProjectDocsRaw([])
        const nextSettings = normalizeSettings(loadFromStorage('offerFlow_settings', defaultSettings))
        setSettingsRaw(nextSettings)
      } else {
        console.error('[AppContext] API load failed, falling back to localStorage', err)
        addToast('数据加载失败，使用本地缓存', 'error')
        const mock = generateMockData()
        setJobsRaw(migrateJobs(loadFromStorage('offerFlow_jobs', mock.jobs)))
        setResumesRaw(loadFromStorage('offerFlow_resumes', mock.resumes))
        setTasksRaw(loadFromStorage('offerFlow_tasks', mock.tasks))
        setReviewsRaw(loadFromStorage('offerFlow_reviews', mock.reviews))
        setProjectDocsRaw(loadFromStorage('offerFlow_projectDocs', []))
        setSettingsRaw(normalizeSettings(loadFromStorage(settingsStorageKey(user?.id), defaultSettings)))
      }
    } finally {
      setDataLoading(false)
    }
  }

  // ---- Setters with localStorage sync ----

  const setJobs = useCallback((value) => {
    setJobsRaw((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      saveToStorage('offerFlow_jobs', next)
      return next
    })
  }, [])

  const setResumes = useCallback((value) => {
    setResumesRaw((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      saveToStorage('offerFlow_resumes', next)
      return next
    })
  }, [])

  const setTasks = useCallback((value) => {
    setTasksRaw((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      saveToStorage('offerFlow_tasks', next)
      return next
    })
  }, [])

  const setReviews = useCallback((value) => {
    setReviewsRaw((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      saveToStorage('offerFlow_reviews', next)
      return next
    })
  }, [])

  const setProjectDocs = useCallback((value) => {
    setProjectDocsRaw((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      saveToStorage('offerFlow_projectDocs', next)
      return next
    })
  }, [])

  // ---- Async CRUD methods ----

  // Jobs
  const addJob = useCallback(async (formData) => {
    try {
      const result = await apiFetch('/api/jobs', { method: 'POST', body: JSON.stringify(formData) })
      const newJob = syncInterviewRounds({ ...formData, ...result.job })
      setJobs((prev) => [...prev, newJob])
      return newJob
    } catch (err) {
      addToast(err.message, 'error')
    }
  }, [setJobs, addToast])

  const updateJob = useCallback(async (id, patch) => {
    let previousJobs = null
    setJobs((prev) => {
      previousJobs = prev
      return prev.map((j) => j.id === id ? syncInterviewRounds({ ...j, ...patch }) : j)
    })

    try {
      await apiFetch('/api/jobs', { method: 'PUT', body: JSON.stringify({ id, ...patch }) })
      return true
    } catch (err) {
      if (previousJobs) setJobs(previousJobs)
      addToast(err.message, 'error')
      return false
    }
  }, [setJobs, addToast])

  const deleteJob = useCallback(async (ids) => {
    const idList = Array.isArray(ids) ? ids : [ids]
    if (!idList.length) return false

    let previousJobs = null
    setJobs((prev) => {
      previousJobs = prev
      return prev.filter((j) => !idList.includes(j.id))
    })

    try {
      await apiFetch('/api/jobs', { method: 'DELETE', body: JSON.stringify({ ids: idList }) })
      return true
    } catch (err) {
      if (previousJobs) setJobs(previousJobs)
      addToast(err.message, 'error')
      return false
    }
  }, [setJobs, addToast])

  // Resumes
  const addResume = useCallback(async (formData) => {
    try {
      const result = await apiFetch('/api/resumes', { method: 'POST', body: JSON.stringify(formData) })
      const newResume = result.resume
      setResumes((prev) => [...prev, newResume])
      return newResume
    } catch (err) {
      addToast(err.message, 'error')
    }
  }, [setResumes, addToast])

  const updateResume = useCallback(async (id, patch) => {
    let previousResumes = null
    setResumes((prev) => {
      previousResumes = prev
      return prev.map((r) => r.id === id ? { ...r, ...patch } : r)
    })

    try {
      await apiFetch('/api/resumes', { method: 'PUT', body: JSON.stringify({ id, ...patch }) })
      return true
    } catch (err) {
      if (previousResumes) setResumes(previousResumes)
      addToast(err.message, 'error')
      return false
    }
  }, [setResumes, addToast])

  const deleteResume = useCallback(async (id) => {
    try {
      await apiFetch(`/api/resumes?id=${id}`, { method: 'DELETE' })
      setResumes((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      addToast(err.message, 'error')
    }
  }, [setResumes, addToast])

  // Tasks
  const addTask = useCallback(async (formData) => {
    try {
      const result = await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(formData) })
      const newTask = result.task
      setTasks((prev) => [...prev, newTask])
      return newTask
    } catch (err) {
      addToast(err.message, 'error')
    }
  }, [setTasks, addToast])

  const updateTask = useCallback(async (id, patch) => {
    let previousTasks = null
    setTasks((prev) => {
      previousTasks = prev
      return prev.map((t) => t.id === id ? { ...t, ...patch } : t)
    })

    try {
      await apiFetch('/api/tasks', { method: 'PUT', body: JSON.stringify({ id, ...patch }) })
      return true
    } catch (err) {
      if (previousTasks) setTasks(previousTasks)
      addToast(err.message, 'error')
      return false
    }
  }, [setTasks, addToast])

  const deleteTask = useCallback(async (id) => {
    try {
      await apiFetch(`/api/tasks?id=${id}`, { method: 'DELETE' })
      setTasks((prev) => prev.filter((t) => t.id !== id))
    } catch (err) {
      addToast(err.message, 'error')
    }
  }, [setTasks, addToast])

  // Reviews
  const addReview = useCallback(async (reviewData) => {
    try {
      const result = await apiFetch('/api/reviews', { method: 'POST', body: JSON.stringify(reviewData) })
      const newReview = {
        ...result.review,
        attachments: Array.isArray(result.review.attachments) ? result.review.attachments : [],
        positiveTags: reviewData.positiveTags || [],
        negativeTags: reviewData.negativeTags || [],
      }
      setReviews((prev) => [...prev, newReview])
      return newReview
    } catch (err) {
      addToast(err.message, 'error')
    }
  }, [setReviews, addToast])

  const updateReview = useCallback(async (id, patch) => {
    try {
      await apiFetch('/api/reviews', { method: 'PUT', body: JSON.stringify({ id, ...patch }) })
      setReviews((prev) => prev.map((r) =>
        r.id === id
          ? {
              ...r,
              ...patch,
              attachments:
                Array.isArray(patch.attachments)
                  ? patch.attachments
                  : r.attachments || [],
            }
          : r
      ))
    } catch (err) {
      addToast(err.message, 'error')
    }
  }, [setReviews, addToast])

  const deleteReview = useCallback(async (id) => {
    try {
      await deleteReviewAttachmentsByReviewId(id)
      await apiFetch(`/api/reviews?id=${id}`, { method: 'DELETE' })
      setReviews((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      addToast(err.message, 'error')
    }
  }, [setReviews, addToast])


  // Project docs
  const addProjectDoc = useCallback(async (formData) => {
    const optimisticId = formData.id || crypto.randomUUID()
    try {
      const optimistic = { ...formData, id: optimisticId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      setProjectDocs((prev) => [optimistic, ...prev])
      const result = await apiFetch('/api/project-docs', { method: 'POST', body: JSON.stringify({ ...formData, id: optimisticId }) })
      setProjectDocs((prev) => prev.map((p) => p.id === optimisticId ? result.projectDoc : p))
      return result.projectDoc
    } catch (err) {
      setProjectDocs((prev) => prev.filter((p) => p.id !== optimisticId))
      addToast(err.message, 'error')
      return null
    }
  }, [setProjectDocs, addToast])

  const updateProjectDoc = useCallback(async (id, patch) => {
    let previous = null
    setProjectDocs((prev) => {
      previous = prev
      return prev.map((p) => p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)
    })
    try {
      const result = await apiFetch('/api/project-docs', { method: 'PUT', body: JSON.stringify({ id, ...patch }) })
      setProjectDocs((prev) => prev.map((p) => p.id === id ? result.projectDoc : p))
      return true
    } catch (err) {
      if (previous) setProjectDocs(previous)
      addToast(err.message, 'error')
      return false
    }
  }, [setProjectDocs, addToast])

  const deleteProjectDoc = useCallback(async (id) => {
    let previous = null
    setProjectDocs((prev) => {
      previous = prev
      return prev.filter((p) => p.id !== id)
    })
    try {
      await apiFetch(`/api/project-docs?id=${id}`, { method: 'DELETE' })
      return true
    } catch (err) {
      if (previous) setProjectDocs(previous)
      addToast(err.message, 'error')
      return false
    }
  }, [setProjectDocs, addToast])

  // Settings: local cache + account-level persistence when logged in
  const setSettings = useCallback((value) => {
    const next = normalizeSettings(typeof value === 'function' ? value(settings) : value)
    setSettingsRaw(next)
    saveToStorage(settingsStorageKey(user?.id), next)
    if (!user?.id) saveToStorage('offerFlow_settings', next)

    if (user?.id) {
      apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: next }),
      }).catch((err) => {
        console.error('[AppContext] settings persistence failed', err)
        addToast('设置已保存到本地，但同步到账户失败', 'error')
      })
    }
  }, [settings, user?.id, addToast])

  const appValue = useMemo(() => ({
    jobs, setJobs,
    resumes, setResumes,
    tasks, setTasks,
    reviews, setReviews,
    projectDocs, setProjectDocs,
    addJob, updateJob, deleteJob,
    addResume, updateResume, deleteResume,
    addTask, updateTask, deleteTask,
    addReview, updateReview, deleteReview,
    addProjectDoc, updateProjectDoc, deleteProjectDoc,
    settings, setSettings,
    addToast,
    dataLoading,
  }), [
    jobs, setJobs,
    resumes, setResumes,
    tasks, setTasks,
    reviews, setReviews,
    projectDocs, setProjectDocs,
    addJob, updateJob, deleteJob,
    addResume, updateResume, deleteResume,
    addTask, updateTask, deleteTask,
    addReview, updateReview, deleteReview,
    addProjectDoc, updateProjectDoc, deleteProjectDoc,
    settings, setSettings,
    addToast,
    dataLoading,
  ])

  const toastValue = useMemo(() => ({ toasts }), [toasts])

  return (
    <ToastContext.Provider value={toastValue}>
      <AppContext.Provider value={appValue}>
        {children}
        <Toast />
      </AppContext.Provider>
    </ToastContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

export function useToasts() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToasts must be used within AppProvider')
  return ctx
}
