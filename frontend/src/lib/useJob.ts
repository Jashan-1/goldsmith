import { useQuery } from '@tanstack/react-query'
import { api, type Job } from '../api/client'

/** Polls a background job every second until it is done or failed. */
export function useJob(jobId: string | null) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api<Job>(`/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (q) =>
      q.state.data?.status === 'done' || q.state.data?.status === 'failed' ? false : 1000,
  })
}
