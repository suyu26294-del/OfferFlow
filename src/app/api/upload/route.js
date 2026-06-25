import { NextResponse } from 'next/server'

// POST /api/upload — upload a file
export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    // TODO: Save file to disk or S3
    return NextResponse.json({
      message: 'File uploaded',
      fileName: file.name,
      fileSize: file.size,
      url: `/uploads/${file.name}`,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
