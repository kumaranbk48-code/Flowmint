import { redirect } from 'next/navigation'

export default async function Page({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams
  if (project) {
    redirect(`/projects#${project}`)
  }
  redirect('/')
}
