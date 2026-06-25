import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { parseDocx } from '@/lib/ai/docParser'

const MAX_FILE_SIZE = 8 * 1024 * 1024

async function readTextFile(file) {
  const buffer = Buffer.from(await file.arrayBuffer())
  const name = file.name || ''
  const ext = name.split('.').pop()?.toLowerCase()

  if (ext === 'docx') {
    const parsed = await parseDocx(buffer)
    return parsed.text
  }

  if (['txt', 'md', 'markdown', 'csv', 'json'].includes(ext) || file.type.startsWith('text/')) {
    return buffer.toString('utf8')
  }

  throw new Error('仅支持 .docx / .txt / .md / .json / .csv 文本类项目文档。PDF 可先复制正文粘贴到项目正文。')
}

function guessTitle(fileName, text) {
  const firstLine = String(text || '').split('\n').find((line) => line.trim().length > 3)?.trim()
  if (firstLine && firstLine.length <= 60) return firstLine.replace(/^#+\s*/, '')
  return (fileName || '项目文档').replace(/\.[^.]+$/, '')
}

export async function POST(request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file) return NextResponse.json({ error: '请选择项目文档文件' }, { status: 400 })
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: '文件不能超过 8MB' }, { status: 400 })

    const text = await readTextFile(file)
    if (!text || text.trim().length < 20) return NextResponse.json({ error: '文档内容过少，无法作为项目库材料' }, { status: 422 })

    return NextResponse.json({
      title: guessTitle(file.name, text),
      content: text.trim(),
      fileName: file.name,
      fileType: file.type || file.name.split('.').pop()?.toLowerCase() || '',
      sourceType: 'upload',
    })
  } catch (err) {
    return NextResponse.json({ error: err.message || '项目文档解析失败' }, { status: 500 })
  }
}
