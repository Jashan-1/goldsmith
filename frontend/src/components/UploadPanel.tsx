import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, type FieldMapping, type Job, type Upload } from '../api/client'
import MappingForm from './MappingForm'

export default function UploadPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient()
  const [upload, setUpload] = useState<Upload | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const send = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return api<Upload>(`/projects/${projectId}/files`, { method: 'POST', body })
    },
    onSuccess: setUpload,
  })

  const confirm = useMutation({
    mutationFn: (mapping: FieldMapping) =>
      api<Job>(`/projects/${projectId}/files/${upload!.id}/mapping`, {
        method: 'POST',
        body: JSON.stringify(mapping),
      }),
    onSuccess: (job) => {
      setUpload(null)
      setJobId(job.id)
    },
  })

  const job = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api<Job>(`/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (q) =>
      q.state.data?.status === 'done' || q.state.data?.status === 'failed' ? false : 1000,
  })

  const status = job.data?.status
  useEffect(() => {
    if (status === 'done') queryClient.invalidateQueries({ queryKey: ['rows', projectId] })
  }, [status, projectId, queryClient])

  if (upload)
    return (
      <>
        <MappingForm
          upload={upload}
          submitting={confirm.isPending}
          onSubmit={(m) => confirm.mutate(m)}
          onCancel={() => setUpload(null)}
        />
        {confirm.error && <p className="mt-2 text-sm text-red-600">{confirm.error.message}</p>}
      </>
    )

  if (jobId && status !== 'failed' && status !== 'done')
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <p className="text-sm text-stone-600">
          Importing: embedding, removing duplicates and clustering… {job.data?.progress ?? 0}%
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded bg-stone-100">
          <div
            className="h-full bg-amber-500 transition-all"
            style={{ width: `${job.data?.progress ?? 0}%` }}
          />
        </div>
      </div>
    )

  const pick = (files: FileList | null) => files?.[0] && send.mutate(files[0])

  return (
    <div>
      <label
        className={`block cursor-pointer rounded-lg border-2 border-dashed p-8 text-center ${
          dragging ? 'border-amber-500 bg-amber-50' : 'border-stone-300 bg-white'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          pick(e.dataTransfer.files)
        }}
      >
        <input
          type="file"
          accept=".csv,.jsonl,.ndjson"
          className="sr-only"
          onChange={(e) => pick(e.target.files)}
        />
        <p className="font-medium">
          {send.isPending ? 'Uploading…' : 'Drop a CSV or JSONL file, or click to choose'}
        </p>
        <p className="mt-1 text-sm text-stone-500">
          Q&amp;A pairs and chat transcripts (OpenAI messages) work too. Up to 10 MB / 5,000 rows.
        </p>
      </label>
      {send.error && <p className="mt-2 text-sm text-red-600">{send.error.message}</p>}
      {status === 'failed' && job.data && (
        <p className="mt-2 text-sm text-red-600">Import failed: {job.data.error}</p>
      )}
    </div>
  )
}
