// Re-mounts on every navigation, so each page fades up into place — a light,
// native-feeling transition. CSS only; off for reduced motion.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
