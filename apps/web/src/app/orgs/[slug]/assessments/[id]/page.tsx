import { AssessmentResultsClient } from './results-client';

interface Props {
  params: Promise<{ slug: string; id: string }>;
}

export default async function AssessmentResultsPage({ params }: Props) {
  const { slug, id } = await params;
  return <AssessmentResultsClient slug={slug} assessmentId={id} />;
}
