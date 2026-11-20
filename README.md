# Cabinet Médical — Medical Practice Management Platform

A full-stack web application for managing a medical practice, built with **React**, **Vite**, **Tailwind CSS**, **Redux Toolkit**, and **Supabase**. It enables patients to register and book appointments online in real time, and allows the doctor to manage time slots, process appointment requests, and publish announcements.

---

## Features

### Patient Portal
- **Authentication & Registration:** Sign up, sign in, and persist sessions via Supabase Auth.
- **Interactive Appointment Calendar (`Agenda`):**
  - Browse available days up to 3 months in advance (minimum 2 days ahead).
  - View real-time 30-minute time slots (`08:00` – `18:00`) with automatic exclusion of doctor-blocked days/hours and already-booked slots.
  - Submit an appointment request with phone number, visit type (`Consultation`, `Follow-up`, `Emergency`, `Other`), and optional notes.
  - Track active appointment status (`Pending`, `Accepted`, `Declined`) and modify/re-request if pending or declined.
- **Announcements Feed:** View clinic updates, schedule changes, and health notices with optional images.
- **Account Settings:** Update profile name and avatar (with client-side image compression), change password, switch language (**French** / **Arabic** with RTL support), and sign out.

### Doctor Workspace
- **Dashboard (`Tableau de bord`):** Overview metrics for total appointments, registered accounts, and published announcements.
- **Schedule & Availability Management (`Agenda`):**
  - Block or unblock full days or individual 30-minute time slots.
  - Click occupied slots to inspect patient appointment details.
- **Appointment Requests (`Demandes de rendez-vous`):** Review pending requests, read patient notes, and accept or decline appointments.
- **Announcements Management (`Annonces`):** Create announcements with optional compressed images and delete existing posts.
- **Settings:** Switch interface language (**French** / **Arabic**) and sign out.

---

## Tech Stack

- **Frontend:** React 19, Vite 6, React Router v7, Redux Toolkit, React Hook Form, Tailwind CSS, SCSS, `motion`, `phosphor-react`
- **Internationalization:** `i18next`, `react-i18next`, `i18next-browser-languagedetector` (French & Arabic)
- **Backend & Database:** Supabase (PostgreSQL, Auth, Row-Level Security, RPC)

---

## Academic Context

Developed as a Bachelor’s Thesis (*Mémoire de Licence*, Class of 2024/2025) at **Mouloud Mammeri University of Tizi Ouzou**
Faculty of Electrical Engineering and Computer Science, Department of Computer Science.
