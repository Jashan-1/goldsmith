import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, type FieldMapping, type Job, type Upload } from '../api/client'
import { useJob } from '../lib/useJob'
import Icon from './Icon'
import MappingForm from './MappingForm'
import { ErrorText, Progress } from './ui'

export default function UploadPanel({
  projectId,
  compact = false,
}: {
  projectId: string
  compact?: boolean
}) {
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

  const job = useJob(jobId)
  const status = job.data?.status
  useEffect(() => {
    if (status === 'done') queryClient.invalidateQueries({ queryKey: ['rows', projectId] })
  }, [status, projectId, queryClient])

  if (upload)
    return (
      <div className="space-y-2">
        <MappingForm
          upload={upload}
          submitting={confirm.isPending}
          onSubmit={(m) => confirm.mutate(m)}
          onCancel={() => setUpload(null)}
        />
        {confirm.error && <ErrorText>{confirm.error.message}</ErrorText>}
      </div>
    )

  if (jobId && status !== 'failed' && status !== 'done')
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium">Importing your data</span>
          <span className="text-muted tabular-nums">{job.data?.progress ?? 0}%</span>
        </div>
        <p className="mt-1 text-[13px] text-muted">
          Embedding rows, removing near-duplicates and grouping similar ones.
        </p>
        <div className="mt-4">
          <Progress value={job.data?.progress ?? 0} />
        </div>
      </div>
    )

  const pick = (files: FileList | null) => files?.[0] && send.mutate(files[0])

  return (
    <div className="space-y-2">
      <label
        className={`flex cursor-pointer flex-col items-center rounded-2xl border border-dashed text-center transition-colors ${
          compact ? 'px-6 py-6' : 'px-6 py-14'
        } ${dragging ? 'border-gold bg-gold-soft' : 'border-line-strong bg-surface hover:bg-sunken/50'}`}
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
        <span className="grid size-10 place-items-center rounded-xl border border-line bg-surface text-muted shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <Icon name="cloud-upload" />
        </span>
        <p className="mt-3 text-[14px] font-medium">
          {send.isPending ? 'Uploading…' : 'Drop a file here, or click to choose'}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          CSV or JSONL · Q&amp;A pairs · chat transcripts in OpenAI format · up to 10 MB / 5,000
          rows
        </p>
      </label>
      {send.error && <ErrorText>{send.error.message}</ErrorText>}
      {status === 'failed' && job.data && <ErrorText>Import failed: {job.data.error}</ErrorText>}
    </div>
  )
}
