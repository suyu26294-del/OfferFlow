export const dynamic = 'force-dynamic'

import MainLayoutClient from './main-layout-client'

export default function MainLayout({ children }) {
  return <MainLayoutClient>{children}</MainLayoutClient>
}
