'use client';

import { useParams } from 'next/navigation';
import CompetitionForm from '../CompetitionForm';

export default function EditCompetitionPage() {
  const params = useParams<{ id: string }>();
  return <CompetitionForm competitionId={params.id} />;
}
