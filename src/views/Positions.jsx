"use client";
import {
  memo,
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useApp } from "../store/AppContext";
import JobModal from "../components/JobModal";
import JobDetailModal from "../components/JobDetailModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { evaluateJob, getScoreBadgeClass } from "../lib/jobScoring";

const STATUS_OPTIONS = [
  "全部",
  "感兴趣",
  "准备投递",
  "已投递",
  "OA / 笔试",
  "一面中",
  "二面中",
  "三面中",
  "终面中",
  "Offer",
  "已结束",
];
const PRIORITY_OPTIONS = ["全部", "高", "中", "低"];
const SCORE_OPTIONS = [
  { value: "全部", label: "全部评分" },
  { value: "strong", label: "强烈推荐" },
  { value: "recommended", label: "推荐关注" },
  { value: "caution", label: "谨慎评估" },
  { value: "low", label: "不建议优先" },
];

const statusColors = {
  感兴趣:
    "bg-blue-500/[0.15] text-blue-700 dark:text-blue-300 border-blue-500/30",
  准备投递:
    "bg-amber-500/[0.15] text-amber-700 dark:text-amber-300 border-amber-500/30",
  已投递:
    "bg-cyan-500/[0.15] text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  "OA / 笔试":
    "bg-orange-500/[0.15] text-orange-700 dark:text-orange-300 border-orange-500/30",
  一面中: "bg-offer-primary/[0.15] text-offer-accent border-offer-primary/30",
  二面中:
    "bg-purple-500/[0.15] text-purple-700 dark:text-purple-300 border-purple-500/30",
  三面中:
    "bg-violet-500/[0.15] text-violet-700 dark:text-violet-300 border-violet-500/30",
  终面中:
    "bg-pink-500/[0.15] text-pink-700 dark:text-pink-300 border-pink-500/30",
  Offer:
    "bg-emerald-500/[0.15] text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  已结束: "bg-red-500/[0.15] text-red-700 dark:text-red-300 border-red-500/30",
};

function calcDays(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : "-";
}

function inScoreBucket(score, bucket) {
  if (bucket === "全部") return true;
  if (bucket === "strong") return score >= 85;
  if (bucket === "recommended") return score >= 72 && score < 85;
  if (bucket === "caution") return score >= 60 && score < 72;
  if (bucket === "low") return score < 60;
  return true;
}

const ScoreBadge = memo(function ScoreBadge({ analysis, compact = false }) {
  if (!analysis) return null;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border ${getScoreBadgeClass(analysis.level.tone)} ${compact ? "px-2.5 py-1" : "px-3 py-1.5"}`}
    >
      <span className="text-sm font-bold tabular-nums">{analysis.score}</span>
      <span className="text-[11px] font-medium whitespace-nowrap">
        {analysis.level.label}
      </span>
    </div>
  );
});

const JobRow = memo(function JobRow({
  job,
  company,
  companyJobCount,
  showCompany,
  isLastInCompany,
  selected,
  resumeName,
  onToggleOne,
  onOpenDetail,
  onOpenEdit,
  onRequestDelete,
}) {
  const days = calcDays(job.appliedDate);

  return (
    <tr
      onClick={() => onOpenDetail(job.id)}
      className={`${isLastInCompany ? "border-b border-white/[0.08]" : "border-b border-white/10"} hover:bg-white/[0.04] transition-colors cursor-pointer`}
    >
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleOne(job.id)}
          className="w-4 h-4 rounded border-white/20 bg-black/40 accent-offer-primary cursor-pointer"
        />
      </td>
      {showCompany && (
        <td
          rowSpan={companyJobCount}
          className="align-top border-r border-white/[0.08] bg-white/[0.02] px-4 py-5"
        >
          <div className="flex items-start gap-3 group">
            <div className="mt-1 h-12 w-1 rounded-full bg-purple-400/50 shrink-0 group-hover:bg-purple-300/60 transition-colors" />
            <div>
              <div className="text-[10px] font-semibold text-purple-400/70 uppercase tracking-wider mb-1">
                公司
              </div>
              <div className="text-base font-bold text-theme-text transition-colors">
                {company}
              </div>
              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs text-purple-300 font-medium">
                {companyJobCount} 个岗位
              </div>
            </div>
          </div>
        </td>
      )}
      <td className="px-4 py-3 text-white font-medium whitespace-nowrap">
        {job.jobTitle}
      </td>
      <td className="px-4 py-3">
        <ScoreBadge analysis={job._score} compact />
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusColors[job.status] || "bg-white/[0.04] text-gray-300 dark:text-white/65 border-white/10"}`}
        >
          {job.status}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-300 dark:text-white/65 whitespace-nowrap">
        {job.city || "-"}
      </td>
      <td className="px-4 py-3 text-gray-300 dark:text-white/65 whitespace-nowrap">
        {job.channel || "-"}
      </td>
      <td className="px-4 py-3 text-gray-300 dark:text-white/65 whitespace-nowrap">
        {job.appliedDate || "-"}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {days !== "-" ? (
          <span
            className={`font-medium ${days <= 7 ? "text-emerald-400" : days <= 14 ? "text-amber-400" : "text-gray-300 dark:text-white/65"}`}
          >
            {days} 天
          </span>
        ) : (
          <span className="text-gray-500 dark:text-white/45">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${job.priority === "高" ? "bg-red-500/[0.15] text-red-700 dark:text-red-300 border-red-500/30" : job.priority === "中" ? "bg-amber-500/[0.15] text-amber-700 dark:text-amber-300 border-amber-500/30" : "bg-white/[0.04] text-gray-300 dark:text-white/65 border-white/10"}`}
        >
          {job.priority || "-"}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-300 dark:text-white/65 text-xs whitespace-nowrap">
        {resumeName}
      </td>
      <td
        className="px-4 py-3 text-gray-300 dark:text-white/65 text-xs max-w-[120px] truncate"
        title={job.nextAction}
      >
        {job.nextAction || "-"}
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onOpenEdit(job)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 dark:text-white/45 hover:text-offer-accent hover:bg-white/[0.06] transition-colors"
            title="编辑"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button
            onClick={() => onRequestDelete(job)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 dark:text-white/45 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="删除"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
});

export default function Positions() {
  const { jobs, resumes, settings, addToast, deleteJob } = useApp();

  const [selectedIds, setSelectedIds] = useState(new Set());

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [channelFilter, setChannelFilter] = useState("全部");
  const [cityFilter, setCityFilter] = useState("全部");
  const [priorityFilter, setPriorityFilter] = useState("全部");
  const [scoreFilter, setScoreFilter] = useState("全部");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [detailJobId, setDetailJobId] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deletingJob, setDeletingJob] = useState(null);

  const deferredSearch = useDeferredValue(search);
  const [isPending, startTransition] = useTransition();

  const scoredJobs = useMemo(() => {
    return jobs.map((job) => ({ ...job, _score: evaluateJob(job, settings) }));
  }, [jobs, settings]);

  const channels = useMemo(() => {
    const set = new Set(jobs.map((j) => j.channel).filter(Boolean));
    return ["全部", ...Array.from(set)];
  }, [jobs]);

  const cities = useMemo(() => {
    const set = new Set(jobs.map((j) => j.city).filter(Boolean));
    return ["全部", ...Array.from(set)];
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return scoredJobs.filter((j) => {
      if (statusFilter !== "全部" && j.status !== statusFilter) return false;
      if (channelFilter !== "全部" && j.channel !== channelFilter) return false;
      if (cityFilter !== "全部" && j.city !== cityFilter) return false;
      if (priorityFilter !== "全部" && j.priority !== priorityFilter)
        return false;
      if (!inScoreBucket(j._score.score, scoreFilter)) return false;
      if (deferredSearch) {
        const q = deferredSearch.trim().toLowerCase();
        const match = (s) => (s || "").toLowerCase().includes(q);
        if (
          !match(j.companyName) &&
          !match(j.jobTitle) &&
          !match(j.city) &&
          !match(j.channel) &&
          !match(j.jdText) &&
          !match(j.notes)
        )
          return false;
      }
      return true;
    });
  }, [
    scoredJobs,
    deferredSearch,
    statusFilter,
    channelFilter,
    cityFilter,
    priorityFilter,
    scoreFilter,
  ]);

  const groupedJobs = useMemo(() => {
    const groups = {};
    filteredJobs.forEach((job) => {
      const company = job.companyName || "未填写公司";
      if (!groups[company]) groups[company] = [];
      groups[company].push(job);
    });
    return Object.entries(groups)
      .sort(([, a], [, b]) => {
        const aScore = Math.max(...a.map((j) => j._score?.score || 0));
        const bScore = Math.max(...b.map((j) => j._score?.score || 0));
        if (aScore !== bScore) return bScore - aScore;
        const aMax = Math.max(
          ...a.map((j) => new Date(j.appliedDate || 0).getTime()),
        );
        const bMax = Math.max(
          ...b.map((j) => new Date(j.appliedDate || 0).getTime()),
        );
        if (aMax !== bMax) return bMax - aMax;
        return b[0].companyName?.localeCompare(a[0].companyName || "") || 0;
      })
      .map(([company, jobs]) => ({
        company,
        jobs: jobs.sort((a, b) => {
          const scoreDiff = (b._score?.score || 0) - (a._score?.score || 0);
          if (scoreDiff) return scoreDiff;
          const aDate = a.appliedDate || "";
          const bDate = b.appliedDate || "";
          return (
            bDate.localeCompare(aDate) ||
            a.jobTitle?.localeCompare(b.jobTitle || "") ||
            0
          );
        }),
      }));
  }, [filteredJobs]);

  const scoreStats = useMemo(() => {
    if (!scoredJobs.length) return { avg: 0, strong: 0, recommended: 0 };
    const avg = Math.round(
      scoredJobs.reduce((sum, j) => sum + (j._score?.score || 0), 0) /
        scoredJobs.length,
    );
    return {
      avg,
      strong: scoredJobs.filter((j) => (j._score?.score || 0) >= 85).length,
      recommended: scoredJobs.filter((j) => (j._score?.score || 0) >= 72)
        .length,
    };
  }, [scoredJobs]);

  const resumeMap = useMemo(() => {
    return new Map(resumes.map((resume) => [resume.id, resume.name]));
  }, [resumes]);

  const getResumeName = useCallback(
    (id) => {
      if (!id) return "-";
      return resumeMap.get(id) || "-";
    },
    [resumeMap],
  );

  const allSelected =
    filteredJobs.length > 0 &&
    filteredJobs.every((job) => selectedIds.has(job.id));

  const toggleAll = useCallback(() => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredJobs.map((j) => j.id)));
  }, [allSelected, filteredJobs]);

  const toggleOne = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const updateFilter = useCallback(
    (setter, value) => {
      setSelectedIds(new Set());
      startTransition(() => setter(value));
    },
    [startTransition],
  );

  const clearFilters = useCallback(() => {
    setSelectedIds(new Set());
    startTransition(() => {
      setStatusFilter("全部");
      setChannelFilter("全部");
      setCityFilter("全部");
      setPriorityFilter("全部");
      setScoreFilter("全部");
      setSearch("");
    });
  }, [startTransition]);

  const handleSearchChange = useCallback((e) => {
    setSearch(e.target.value);
    setSelectedIds(new Set());
  }, []);

  const openAdd = useCallback(() => {
    setEditingJob(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((job) => {
    const { _score, ...cleanJob } = job;
    setEditingJob(cleanJob);
    setModalOpen(true);
  }, []);

  const openDetail = useCallback((jobId) => setDetailJobId(jobId), []);

  const handleEditFromDetail = useCallback((job) => {
    setEditingJob(job);
    setModalOpen(true);
  }, []);

  const handleDeleteFromDetail = useCallback((job) => {
    setDeletingJob(job);
    setDeletingId(job.id);
    setConfirmOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setEditingJob(null);
  }, []);

  const requestDelete = useCallback((job) => {
    setDeletingJob(job);
    setDeletingId(job.id);
    setConfirmOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    const id = deletingId;
    const deletePromise = deleteJob(id);

    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    setConfirmOpen(false);
    setDeletingId(null);
    setDeletingJob(null);
    setDetailJobId(null);

    const ok = await deletePromise;
    if (ok !== false) addToast("岗位已删除", "success");
  }, [deleteJob, deletingId, addToast]);

  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) {
      addToast("请先选择要删除的岗位", "error");
      return;
    }
    setDeletingId("batch");
    setConfirmOpen(true);
  }, [selectedIds.size, addToast]);

  const confirmBatchDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const count = ids.length;
    const deletePromise = deleteJob(ids);

    setSelectedIds(new Set());
    setConfirmOpen(false);
    setDeletingId(null);
    setDeletingJob(null);

    const ok = await deletePromise;
    if (ok !== false) addToast(`已删除 ${count} 个岗位`, "success");
  }, [deleteJob, selectedIds, addToast]);

  const handleConfirm = useCallback(() => {
    if (deletingId === "batch") confirmBatchDelete();
    else confirmDelete();
  }, [deletingId, confirmBatchDelete, confirmDelete]);

  const handleExport = () => {
    if (filteredJobs.length === 0) {
      addToast("没有可导出的数据", "error");
      return;
    }
    const header =
      "公司,岗位,评分,推荐等级,状态,城市,薪资范围,渠道,投递日期,优先级,联系人,下一步行动,主要理由,风险提示";
    const rows = filteredJobs.map((j) =>
      [
        j.companyName,
        j.jobTitle,
        j._score?.score,
        j._score?.level?.label,
        j.status,
        j.city,
        j.salaryRange,
        j.channel,
        j.appliedDate,
        j.priority,
        j.contactName,
        j.nextAction,
        (j._score?.reasons || []).join("；"),
        (j._score?.risks || []).join("；"),
      ]
        .map((v) => `"${String(v || "").replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = "﻿" + header + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `岗位库_含评分_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast(`已导出 ${filteredJobs.length} 条记录`, "success");
  };

  const activeFilters =
    (statusFilter !== "全部" ? 1 : 0) +
    (channelFilter !== "全部" ? 1 : 0) +
    (cityFilter !== "全部" ? 1 : 0) +
    (priorityFilter !== "全部" ? 1 : 0) +
    (scoreFilter !== "全部" ? 1 : 0) +
    (search ? 1 : 0);

  return (
    <div className="px-6 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            岗位库
          </h1>
          <p className="text-sm text-gray-400 dark:text-white/45 mt-1">
            管理所有投递岗位，共 {jobs.length} 个记录
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2">
            <p className="text-[11px] text-white/45">平均评分</p>
            <p className="text-lg font-bold text-white">{scoreStats.avg}</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] px-4 py-2">
            <p className="text-[11px] text-emerald-300/70">强烈推荐</p>
            <p className="text-lg font-bold text-emerald-300">
              {scoreStats.strong}
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.08] px-4 py-2">
            <p className="text-[11px] text-cyan-300/70">推荐以上</p>
            <p className="text-lg font-bold text-cyan-300">
              {scoreStats.recommended}
            </p>
          </div>
        </div>
      </div>

      <div className="card-modern p-5 mb-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <svg
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-white/45"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="搜索公司、岗位、城市、渠道、JD..."
              value={search}
              onChange={handleSearchChange}
              className="min-h-[40px] w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 !pl-12 pr-4 text-sm text-white placeholder:text-gray-500 dark:placeholder:text-white/45 outline-none transition-all duration-200 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/20"
            />
            {(isPending || deferredSearch !== search) && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-purple-300/80">
                筛选中
              </span>
            )}
          </div>

          <div className="flex gap-2 ml-auto">
            <button onClick={openAdd} className="btn-gradient">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              新增岗位
            </button>

            <button
              onClick={handleBatchDelete}
              className={`btn-danger px-4 py-2.5 text-sm ${selectedIds.size > 0 ? "" : "opacity-50"}`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              删除{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </button>

            <button onClick={handleExport} className="btn-secondary">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              导出
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => updateFilter(setStatusFilter, s)}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  statusFilter === s
                    ? "border-purple-400/60 bg-purple-600/25 text-white font-semibold shadow-sm shadow-purple-950/20"
                    : "border-theme-border bg-white dark:bg-white/[0.03] text-slate-700 dark:text-white/65 hover:bg-slate-100 dark:hover:bg-white/[0.07] hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-theme-border" />

          <select
            value={scoreFilter}
            onChange={(e) => updateFilter(setScoreFilter, e.target.value)}
            className="min-h-[40px] rounded-xl border border-theme-border bg-theme-card px-4 py-2.5 text-sm font-medium text-theme-text outline-none transition-all duration-200 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/20 appearance-none cursor-pointer"
          >
            {SCORE_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
                className="bg-theme-card text-theme-text"
              >
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={channelFilter}
            onChange={(e) => updateFilter(setChannelFilter, e.target.value)}
            className="min-h-[40px] rounded-xl border border-theme-border bg-theme-card px-4 py-2.5 text-sm font-medium text-theme-text outline-none transition-all duration-200 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/20 appearance-none cursor-pointer"
          >
            {channels.map((c) => (
              <option
                key={c}
                value={c}
                className="bg-theme-card text-theme-text"
              >
                {c === "全部" ? "全部渠道" : c}
              </option>
            ))}
          </select>

          <select
            value={cityFilter}
            onChange={(e) => updateFilter(setCityFilter, e.target.value)}
            className="min-h-[40px] rounded-xl border border-theme-border bg-theme-card px-4 py-2.5 text-sm font-medium text-theme-text outline-none transition-all duration-200 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/20 appearance-none cursor-pointer"
          >
            {cities.map((c) => (
              <option
                key={c}
                value={c}
                className="bg-theme-card text-theme-text"
              >
                {c === "全部" ? "全部城市" : c}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap items-center gap-2">
            {PRIORITY_OPTIONS.map((p) => (
              <button
                key={p}
                onClick={() => updateFilter(setPriorityFilter, p)}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  priorityFilter === p
                    ? "border-purple-400/60 bg-purple-600/25 text-white font-semibold shadow-sm shadow-purple-950/20"
                    : "border-theme-border bg-white dark:bg-white/[0.03] text-slate-700 dark:text-white/65 hover:bg-slate-100 dark:hover:bg-white/[0.07] hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {activeFilters > 0 && (
            <button
              onClick={clearFilters}
              className="text-sm text-offer-accent hover:text-white transition-colors ml-1"
            >
              清除筛选
            </button>
          )}
        </div>
      </div>

      <div className="card-modern overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02]">
                <th className="w-10 px-4 py-3.5 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-white/20 bg-black/40 accent-offer-primary cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3.5 text-left text-gray-400 dark:text-white/35 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                  公司
                </th>
                <th className="px-4 py-3.5 text-left text-gray-400 dark:text-white/35 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                  岗位
                </th>
                <th className="px-4 py-3.5 text-left text-gray-400 dark:text-white/35 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                  评分
                </th>
                <th className="px-4 py-3.5 text-left text-gray-400 dark:text-white/35 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                  状态
                </th>
                <th className="px-4 py-3.5 text-left text-gray-400 dark:text-white/35 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                  城市
                </th>
                <th className="px-4 py-3.5 text-left text-gray-400 dark:text-white/35 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                  渠道
                </th>
                <th className="px-4 py-3.5 text-left text-gray-400 dark:text-white/35 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                  投递日期
                </th>
                <th className="px-4 py-3.5 text-left text-gray-400 dark:text-white/35 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                  等待天数
                </th>
                <th className="px-4 py-3.5 text-left text-gray-400 dark:text-white/35 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                  优先级
                </th>
                <th className="px-4 py-3.5 text-left text-gray-400 dark:text-white/35 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                  关联简历
                </th>
                <th className="px-4 py-3.5 text-left text-gray-400 dark:text-white/35 font-medium text-xs uppercase tracking-wider whitespace-nowrap min-w-[120px]">
                  下一步行动
                </th>
                <th className="px-4 py-3.5 text-left text-gray-400 dark:text-white/35 font-medium text-xs uppercase tracking-wider whitespace-nowrap w-20">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {groupedJobs.map(({ company, jobs }) =>
                jobs.map((job, idx) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    company={company}
                    companyJobCount={jobs.length}
                    showCompany={idx === 0}
                    isLastInCompany={idx === jobs.length - 1}
                    selected={selectedIds.has(job.id)}
                    resumeName={getResumeName(job.resumeId)}
                    onToggleOne={toggleOne}
                    onOpenDetail={openDetail}
                    onOpenEdit={openEdit}
                    onRequestDelete={requestDelete}
                  />
                )),
              )}
            </tbody>
          </table>
        </div>

        {filteredJobs.length === 0 && (
          <div className="py-16 text-center text-gray-500 dark:text-white/45 text-sm">
            {jobs.length === 0
              ? "暂无岗位数据，点击“新增岗位”开始添加"
              : "没有匹配筛选条件的岗位"}
          </div>
        )}

        <div className="px-5 py-3 border-t border-white/10 text-xs text-gray-500 dark:text-white/45 flex items-center justify-between">
          <span>
            显示 {filteredJobs.length} / {jobs.length} 条
          </span>
          {selectedIds.size > 0 && <span>已选 {selectedIds.size} 条</span>}
        </div>
      </div>

      <JobDetailModal
        open={!!detailJobId}
        jobId={detailJobId}
        onClose={() => setDetailJobId(null)}
        onEdit={handleEditFromDetail}
        onDelete={handleDeleteFromDetail}
      />
      <JobModal open={modalOpen} job={editingJob} onClose={handleCloseModal} />
      <ConfirmDialog
        open={confirmOpen}
        title="确认删除"
        message={
          deletingId === "batch"
            ? `确定要删除已选的 ${selectedIds.size} 个岗位吗？此操作不可恢复。`
            : `确定要删除「${deletingJob?.companyName || ""} - ${deletingJob?.jobTitle || ""}」这条岗位记录吗？此操作不可恢复。`
        }
        onConfirm={handleConfirm}
        onCancel={() => {
          setConfirmOpen(false);
          setDeletingId(null);
          setDeletingJob(null);
        }}
      />
    </div>
  );
}
