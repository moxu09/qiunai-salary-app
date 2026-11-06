import { Fragment } from 'react';
import Link from 'next/link';
import { inlineReferenceTokens } from '@/lib/inlineReferences.mjs';

export default function InlineReferences({ text, references, resolveNumber }: {
  text: string;
  references?: Map<string, string | null>;
  resolveNumber?: (number: number, unit: string) => string | undefined;
}) {
  return inlineReferenceTokens(text, references, resolveNumber).map((token, index) => {
    if (!token.href) return <Fragment key={index}>{token.text}</Fragment>;
    if (token.href.startsWith('#')) return <a key={index} className="inline-reference" href={token.href}>{token.text}</a>;
    if (token.href.startsWith('/')) return <Link key={index} className="inline-reference" href={token.href}>{token.text}</Link>;
    return <a key={index} className="inline-reference" href={token.href} target="_blank" rel="noopener noreferrer">{token.text}</a>;
  });
}
