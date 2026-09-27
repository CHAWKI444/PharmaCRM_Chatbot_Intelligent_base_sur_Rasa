import { useEffect, useRef } from 'react';

const StatusBanner = ({ tone = 'error', children }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (children) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [children, tone]);

  if (!children) return null;
  return (
    <div ref={ref} className={`banner banner-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
};

export default StatusBanner;
