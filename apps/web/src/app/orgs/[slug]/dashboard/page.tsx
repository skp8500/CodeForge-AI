import { OrgDashboardClient } from './dashboard-client';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function OrgDashboardPage({ params }: Props) {
  const { slug } = await params;
  return <OrgDashboardClient slug={slug} />;
}
