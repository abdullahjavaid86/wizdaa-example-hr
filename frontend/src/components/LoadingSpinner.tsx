export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-12 w-12' : 'h-8 w-8';
  return (
    <div className={`${dim} animate-spin rounded-full border-4 border-blue-600 border-t-transparent`} />
  );
}

export function PageLoader() {
  return (
    <div className="flex justify-center py-16">
      <LoadingSpinner size="lg" />
    </div>
  );
}
