'use client';
import { ErrorView } from '@/components/ErrorView';

export default function LocaleError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView {...props} />;
}
