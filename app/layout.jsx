import './globals.css';

export const metadata = {
  title: 'Notifier Web',
  description: 'Simple chat demo',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
