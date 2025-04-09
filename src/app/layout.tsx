import './globals.css';

export const metadata = {
  title: 'QR Code Generator',
  description: 'Generate QR codes for Yandex Ultima promocodes and more. Upload your promocodes in bulk or create individual QR codes.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
