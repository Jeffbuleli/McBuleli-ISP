# 🎯 McBuleli ISP - SaaS Management System

## Complete UI/UX Redesign & Architecture

A modern, production-ready SaaS ISP management application with:

- ✅ **Sticky Header + Announcement Banner** (2-level fixed layout)
- ✅ **Responsive Sidebar** (mobile overlay, tablet/desktop collapsible)
- ✅ **Reusable DataTable** (pagination, filtering, sorting, search)
- ✅ **Dark Mode UI** (Green + Brown branding)
- ✅ **Mobile-First Design** (PWA-ready, low-bandwidth optimized)
- ✅ **Team Chat System** (real-time messaging)
- ✅ **Extensible Architecture** (support unlimited modules)
- ✅ **Production-Ready Code** (TypeScript, React, fully responsive)

## 🏗️ Project Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── Header/ (TopBar + AnnouncementBanner)
│   │   ├── Sidebar/ (Navigation, Menu)
│   │   └── MainLayout.tsx
│   ├── common/
│   │   ├── Table/ (DataTable, Pagination)
│   │   ├── Chat/ (TeamChat, ChatMessage)
│   │   ├── Cards/ (StatCard)
│   │   └── Search/ (GlobalSearch)
│   └── modules/
│       ├── Dashboard/
│       ├── UserManagement/
│       ├── Finance/
│       ├── Network/
│       └── Settings/
├── styles/
│   ├── variables.css (Design tokens)
│   └── globals.css (Global styles)
└── App.tsx
```

## 🎨 Design System

### Colors
- **Primary:** Green (#10b981)
- **Secondary:** Brown (#92400e)
- **Background:** Dark (#0f1419)
- **Status:** Success, Warning, Error, Info

### Spacing
- xs, sm, md, lg, xl, 2xl, 3xl (CSS variables)

### Responsive Breakpoints
- Mobile: ≤ 768px
- Tablet: ≤ 1024px
- Desktop: > 1024px

## 🚀 Key Features

### 1. Global Header (Fixed)
- Left: Hamburger + User Avatar
- Center: Global Search (Ctrl+K)
- Right: Chat, Settings, Home
- Sticky announcement banner below

### 2. Sidebar Navigation
- Collapsible menu with icons & badges
- Submenu support
- Mobile overlay on small screens
- Logout button at bottom

### 3. Reusable DataTable
- Server-side pagination (10/20/50/100 rows)
- Search & filtering
- Column sorting
- Row actions dropdown
- Responsive horizontal scroll on mobile
- Empty states & loading indicators

### 4. Team Chat
- Real-time messaging
- User avatars & timestamps
- Auto-scroll to latest message
- Emoji & file attachment buttons

### 5. Dashboard Module
- Stat cards with trends
- Revenue & usage charts
- Top consumers table
- Customizable filters

## 📦 Installation

```bash
npm install
npm run dev
```

## 🔧 Usage

### DataTable Example
```tsx
import DataTable from '@/components/common/Table/DataTable';

<DataTable
  data={users}
  columns={[
    { id: 'name', header: 'Name', sortable: true },
    { id: 'email', header: 'Email', sortable: true },
    { id: 'status', header: 'Status', cell: (val) => <Badge>{val}</Badge> }
  ]}
  searchable={true}
  pageSize={10}
/>
```

### MainLayout Example
```tsx
import MainLayout from '@/components/layout/MainLayout';

<MainLayout onMenuSelect={(menuId) => console.log(menuId)}>
  <Dashboard />
</MainLayout>
```

## 📱 Responsive Behavior

- **Mobile:** Sidebar slides as overlay, main content full width
- **Tablet:** Sidebar narrower, half-width charts
- **Desktop:** Full sidebar, multi-column layouts

## 🎯 Extensibility

The system is designed to scale:

1. **Add New Modules:** Create folder in `/modules`, follow same pattern
2. **Reuse DataTable:** Apply to any list view
3. **Custom Filters:** Define filter config for any table
4. **Global Search:** Index and query any data source
5. **Custom Banners:** Slides system for announcements

## 🌍 Optimization for Africa

- Low bandwidth: Optimized images, lazy loading
- Dark mode: Reduced battery drain on mobile
- Intuitive UX: Minimal clicks, clear navigation
- Offline support: PWA-ready architecture

## 📄 License

MIT
