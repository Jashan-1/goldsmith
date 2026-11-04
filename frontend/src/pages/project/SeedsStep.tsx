import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, type Project, type Seed } from '../../api/client'
import Icon from '../../components/Icon'
import { EmptyState, ErrorText, Loading, PageHeader, Progress } from '../../components/ui'
import { inputText, valueText } from '../../lib/rows'

export default function SeedsStep() {
  const { projectId = '' } = useParams()
  const queryClient = useQueryClient()
  const seeds = useQuery({
    queryKey: ['seeds', projectId],
    queryFn: () => api<Seed[]>(`/projects/${projectId}/seeds`),
  })
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<Project>(`/projects/${projectId}`),
  })
  const select = useMutation({
    mutationFn: () => api<Seed[]>(`/projects/${projectId}/seeds/select`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['seeds', projectId], data)
      queryClient.invalidateQueries({ queryKey: ['rows', projectId] })
    },
  })

  const list = seeds.data ?? []
  const done = list.filter((s) => s.expected_output != null).length
  const isClassification = project.data?.task_type === 'classification'
  // One-click choices for classification: labels already used in the file or in saved seeds.
  const choices = isClassification
    ? [
        ...new Set(
          list
            .flatMap((s) => [valueText(s.row.reference_output), valueText(s.expected_output)])
            .filter(Boolean),
        ),
      ].sort()
    : []

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8 md:px-10">
      <PageHeader
        kicker={<span className="mono-label">03 · Seed examples</span>}
        title="Label a handful of examples"
        description="Goldsmith picks about ten varied rows, at least one from every cluster. Your labels become the examples the model copies."
        actions={
          list.length > 0 && (
            <button
              className="btn-secondary"
              disabled={select.isPending}
              title="Picks new seeds; labelled ones are kept"
              onClick={() => select.mutate()}
            >
              Reselect unlabelled
            </button>
          )
        }
      />
      {seeds.isPending && <Loading />}
      {seeds.error && <ErrorText>{seeds.error.message}</ErrorText>}
      {select.error && <ErrorText>{select.error.message}</ErrorText>}

      {seeds.data && list.length === 0 && (
        <div className="card">
          <EmptyState
            icon="sprout"
            title="No seeds yet"
            action={
              <button
                className="btn-primary"
                disabled={select.isPending}
                onClick={() => select.mutate()}
              >
                {select.isPending ? 'Picking…' : 'Pick seed examples'}
              </button>
            }
          >
            Takes a second. You can reselect any you don't like.
          </EmptyState>
        </div>
      )}

      {list.length > 0 && (
        <>
          <div className="card flex items-center gap-5 px-5 py-4">
            <div className="flex-1">
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="font-medium">
                  {done} of {list.length} labelled
                </span>
                {done < list.length && (
                  <span className="text-muted">{list.length - done} to go</span>
                )}
              </div>
              <div className="mt-2">
                <Progress value={(100 * done) / list.length} />
              </div>
            </div>
            {done > 0 && (
              <Link to="../label" relative="path" className="btn-primary">
                Next: label dataset
                <Icon name="chevron-right" size={14} />
              </Link>
            )}
          </div>
          <ol className="space-y-3">
            {list.map((s, i) => (
              <SeedCard
                key={`${s.row.id}:${valueText(s.expected_output)}`}
                index={i + 1}
                projectId={projectId}
                seed={s}
                choices={choices}
              />
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

function SeedCard({
  index,
  projectId,
  seed,
  choices,
}: {
  index: number
  projectId: string
  seed: Seed
  choices: string[]
}) {
  const queryClient = useQueryClient()
  const saved = valueText(seed.expected_output)
  // Pre-fill from the uploaded reference so the user only has to correct it.
  const [text, setText] = useState(saved || valueText(seed.row.reference_output))
  const isSaved = seed.expected_output != null && text === saved

  const save = useMutation({
    mutationFn: (value: string) =>
      api<Seed>(`/projects/${projectId}/seeds/${seed.row.id}`, {
        method: 'POST',
        body: JSON.stringify({ expected_output: value.trim() }),
      }),
    onSuccess: (updated) =>
      queryClient.setQueryData<Seed[]>(['seeds', projectId], (old) =>
        old?.map((s) => (s.row.id === updated.row.id ? updated : s)),
      ),
  })

  return (
    <li className={`card overflow-hidden transition-colors ${isSaved ? 'border-ok/30' : ''}`}>
      <div className="flex items-center justify-between border-b border-line bg-sunken/50 px-5 py-2 text-[12px] text-muted">
        <span className="font-mono">
          Seed {String(index).padStart(2, '0')} · row {seed.row.row_index + 1} · cluster{' '}
          {seed.row.cluster_id}
        </span>
        {isSaved && (
          <span className="flex items-center gap-1 font-medium text-ok">
            <Icon name="check" size={13} /> Labelled
          </span>
        )}
      </div>
      <div className="space-y-4 px-5 py-4">
        <p className="text-[15px] leading-relaxed whitespace-pre-line">
          {inputText(seed.row.input)}
        </p>

        {choices.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {choices.map((c) => (
              <button
                key={c}
                disabled={save.isPending}
                className={`rounded-full border px-3 py-1 text-[13px] transition-colors ${
                  saved === c
                    ? 'border-ink bg-ink text-on-ink'
                    : 'border-line bg-surface hover:border-line-strong'
                }`}
                onClick={() => {
                  setText(c)
                  save.mutate(c)
                }}
              >
                {c}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <label className="text-[12px] font-medium text-muted" htmlFor={`seed-${seed.row.id}`}>
              Expected output
            </label>
            <textarea
              id={`seed-${seed.row.id}`}
              className="field mt-1 block w-full"
              rows={Math.min(6, Math.max(2, text.split('\n').length))}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                className="btn-primary"
                disabled={!text.trim() || isSaved || save.isPending}
                onClick={() => save.mutate(text)}
              >
                {isSaved ? 'Saved' : seed.expected_output != null ? 'Update label' : 'Save label'}
              </button>
            </div>
          </div>
        )}
        {save.error && <ErrorText>{save.error.message}</ErrorText>}
      </div>
    </li>
  )
}
