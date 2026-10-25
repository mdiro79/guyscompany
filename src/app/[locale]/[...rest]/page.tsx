import { notFound } from 'next/navigation';

// Unknown paths under a locale get the translated 404 page.
export default function CatchAll() {
  notFound();
}
