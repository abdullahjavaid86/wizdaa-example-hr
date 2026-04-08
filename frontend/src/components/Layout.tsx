import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import { useSocketContext } from "../context/SocketContext";

export function Layout() {
  const { user, logout } = useAuthContext();
  const { connected } = useSocketContext();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? "bg-blue-700 text-white"
        : "text-blue-100 hover:bg-blue-600 hover:text-white"
    }`;

  const links = (
    <>
      <NavLink to="/" end className={navLinkClass} onClick={() => setMenuOpen(false)}>
        Dashboard
      </NavLink>
      <NavLink to="/requests" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        My Requests
      </NavLink>
      {(user?.role === "MANAGER" || user?.role === "ADMIN") && (
        <NavLink to="/manager" className={navLinkClass} onClick={() => setMenuOpen(false)}>
          Team Requests
        </NavLink>
      )}
      {user?.role === "ADMIN" && (
        <NavLink to="/admin/balances" className={navLinkClass} onClick={() => setMenuOpen(false)}>
          Manage Balances
        </NavLink>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-blue-800 shadow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo + desktop nav */}
            <div className="flex items-center gap-4">
              <span className="text-lg font-bold text-white">TimeOff</span>
              <div className="hidden md:flex md:items-center md:gap-2">{links}</div>
            </div>

            {/* Right side: status dot + user + logout (desktop) + hamburger */}
            <div className="flex items-center gap-3">
              <span
                title={connected ? "Live updates active" : "Connecting…"}
                className={`h-2 w-2 rounded-full ${connected ? "bg-green-400" : "bg-yellow-400"}`}
              />
              <span className="hidden text-sm text-blue-200 sm:block">
                {user?.name ?? user?.email}
              </span>
              <button
                onClick={handleLogout}
                className="hidden rounded-md bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 md:block"
              >
                Logout
              </button>
              {/* Hamburger */}
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="inline-flex items-center justify-center rounded-md p-2 text-blue-200 hover:bg-blue-700 hover:text-white md:hidden"
                aria-label="Toggle menu"
              >
                {menuOpen ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="border-t border-blue-700 px-4 pb-3 pt-2 md:hidden">
            <div className="flex flex-col gap-1">{links}</div>
            <div className="mt-3 flex items-center justify-between border-t border-blue-700 pt-3">
              <span className="text-sm text-blue-200">{user?.name ?? user?.email}</span>
              <button
                onClick={handleLogout}
                className="rounded-md bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
