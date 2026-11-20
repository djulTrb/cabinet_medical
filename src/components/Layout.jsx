import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useDispatch } from 'react-redux';
import { setSidebarOpen } from '../store/slices/sidebarSlice';
import Header from "./Header";
import Sidebar from "./Sidebar";

export default function Layout() {
  const dispatch = useDispatch();

  // Check if screen is mobile size
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 800;
      if (mobile) {
        dispatch(setSidebarOpen(false));
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [dispatch]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-quicksand">
      {/* Header */}
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
