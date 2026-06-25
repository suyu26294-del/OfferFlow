const DB_NAME = 'offerflow-review-attachments'
const DB_VERSION = 1
const STORE_NAME = 'attachments'

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('reviewId', 'reviewId', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      console.error('[IndexedDB open failed]', request.error)
      reject(request.error)
    }
  })
}

export async function saveReviewAttachment(reviewId, attachmentId, file) {
  const db = await openDB()
  const id = `${reviewId}:${attachmentId}`

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    store.put({
      id,
      reviewId,
      attachmentId,
      blob: file,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      updatedAt: new Date().toISOString(),
    })

    tx.oncomplete = () => {
      db.close()
      console.log('[IndexedDB saved]', id, file.name, file.size)
      resolve(id)
    }

    tx.onerror = () => {
      db.close()
      console.error('[IndexedDB save failed]', id, tx.error)
      reject(tx.error)
    }
  })
}

export async function getReviewAttachment(reviewId, attachmentId) {
  const db = await openDB()
  const id = `${reviewId}:${attachmentId}`

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(id)

    request.onsuccess = () => {
      db.close()
      resolve(request.result?.blob || null)
    }

    request.onerror = () => {
      db.close()
      console.error('[IndexedDB read failed]', id, request.error)
      reject(request.error)
    }
  })
}

export async function deleteReviewAttachment(reviewId, attachmentId) {
  const db = await openDB()
  const id = `${reviewId}:${attachmentId}`

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(id)

    tx.oncomplete = () => {
      db.close()
      console.log('[IndexedDB deleted]', id)
      resolve()
    }

    tx.onerror = () => {
      db.close()
      console.error('[IndexedDB delete failed]', id, tx.error)
      reject(tx.error)
    }
  })
}

export async function deleteReviewAttachmentsByReviewId(reviewId) {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('reviewId')
    const range = IDBKeyRange.only(reviewId)
    const req = index.openCursor(range)

    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        store.delete(cursor.primaryKey)
        cursor.continue()
      }
    }

    tx.oncomplete = () => {
      db.close()
      console.log('[IndexedDB cleaned] reviewId:', reviewId)
      resolve()
    }

    tx.onerror = () => {
      db.close()
      console.error('[IndexedDB cleanup failed]', reviewId, tx.error)
      reject(tx.error)
    }
  })
}
