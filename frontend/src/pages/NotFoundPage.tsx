import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const { user, role } = useAuth();
  const isAdmin = user && role === 'Administrator';

  useEffect(() => {
    document.title = '404 - Page Not Found | AquaLicious';

    // Inject or update robots meta tag to prevent search engines from indexing 404 pages
    let robotsMeta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    let created = false;
    if (!robotsMeta) {
      robotsMeta = document.createElement('meta');
      robotsMeta.name = 'robots';
      document.head.appendChild(robotsMeta);
      created = true;
    }
    const previousContent = robotsMeta.content;
    robotsMeta.content = 'noindex, nofollow';

    return () => {
      if (robotsMeta) {
        if (created) {
          robotsMeta.remove();
        } else {
          robotsMeta.content = previousContent || 'index, follow';
        }
      }
    };
  }, []);

  const homePath = isAdmin ? '/dashboard' : '/';
  const homeLabel = isAdmin ? 'Return to Dashboard' : 'Return to Storefront';

  return (
    <main
      id="main-content"
      className="page-content min-h-[70vh] flex flex-col items-center justify-center p-6 sm:p-12 text-center"
      style={{
        paddingTop: 'calc(2rem + var(--safe-top))',
        paddingBottom: 'calc(2rem + var(--safe-bottom))'
      }}
    >
      <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-[#bbdefb] text-[#1565c0] flex items-center justify-center mx-auto mb-6 shadow-xs">
        <AlertTriangle className="w-8 h-8 text-[#1565c0]" />
      </div>

      <div className="space-y-2 mb-8 max-w-md">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#0b3d91] font-serif tracking-tight">
          404 - Page Not Found
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          The requested URL does not match any valid page on AquaLicious. Please check the spelling or return home.
        </p>
      </div>

      <div>
        <Link
          to={homePath}
          className="btn btn-primary font-bold shadow-md inline-flex items-center gap-2 px-6 py-2.5 rounded-xl cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          {homeLabel}
        </Link>
      </div>
    </main>
  );
};

export default NotFoundPage;
