'use client';

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`skeleton ${className}`} aria-busy="true" aria-label="Loading" />
  );
}

export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="h-4 skeleton w-full" />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <div className="h-10 w-48 skeleton" />
        <div className="h-10 w-20 skeleton" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="h-32 skeleton" />
        <div className="h-32 skeleton" />
        <div className="h-32 skeleton" />
      </div>
      <div className="h-8 skeleton w-1/2" />
      <div className="h-40 skeleton" />
    </div>
  );
}
