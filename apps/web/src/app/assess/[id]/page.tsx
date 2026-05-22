import { AssessClient } from './assess-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AssessPage({ params }: Props) {
  const { id } = await params;
  return <AssessClient assessmentId={id} />;
}
