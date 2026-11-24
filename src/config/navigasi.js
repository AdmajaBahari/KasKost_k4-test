// Menu per peran. Ubah di sini kalau susunan menu berubah.
module.exports = {
  penghuni: {
    nav: [
      { label: 'Beranda', href: '/beranda' },
      { label: 'Riwayat', href: '/riwayat' },
      { label: 'Asisten AI', href: '/asisten' },
      { label: 'Pengaturan', href: '/pengaturan' }
    ],
    sidebar: [
      { ikon: 'user', href: '/pengaturan', label: 'Profil' },
      { ikon: 'sparkle', href: '/asisten', label: 'Asisten AI' },
      { ikon: 'bell', href: '/notifikasi', label: 'Notifikasi', badge: true },
      { ikon: 'gear', href: '/pengaturan', label: 'Pengaturan' }
    ]
  },
  pemilik: {
    nav: [
      { label: 'Beranda', href: '/pemilik' },
      { label: 'Tagihan', href: '/pemilik/tagihan' },
      { label: 'Kas', href: '/pemilik/kas' },
      { label: 'Kos', href: '/pemilik/kos' }
    ],
    sidebar: [
      { huruf: 'P', href: '/pemilik/pengaturan', label: 'Profil' },
      { ikon: 'bell', href: '/notifikasi', label: 'Notifikasi', badge: true },
      { ikon: 'sparkle', href: '/asisten', label: 'Asisten AI' },
      { ikon: 'gear', href: '/pemilik/pengaturan', label: 'Pengaturan' }
    ]
  },
  admin: {
    nav: [
      { label: 'Verifikasi', href: '/admin/tagihan' },
      { label: 'Pengeluaran', href: '/admin/pengeluaran' },
      { label: 'Laporan Kas Kos', href: '/admin/kas' }
    ],
    sidebar: [
      { huruf: 'A', href: '/admin/pengaturan', label: 'Profil' },
      { ikon: 'bell', href: '/notifikasi', label: 'Notifikasi', badge: true },
      { ikon: 'sparkle', href: '/asisten', label: 'Asisten AI' },
      { ikon: 'gear', href: '/admin/pengaturan', label: 'Pengaturan' }
    ]
  }
};