export async function getHealth(): Promise<{ status: string; db: boolean }> {
  const res = await fetch('/api/health')
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}
