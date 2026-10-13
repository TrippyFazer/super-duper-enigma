export default function Loading() {
  return (
    <div className="page space-y-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-6 w-40" />
      <div className="skeleton h-40 w-full rounded-2xl" />
      <div className="skeleton h-10 w-full rounded-full" />
      <div className="skeleton h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-2.5">
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
      </div>
    </div>
  );
}
