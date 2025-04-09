import QRCodeGenerator from './components/QRCodeGenerator';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10 text-center">
          <h1 
            className="text-6xl font-extrabold tracking-tighter text-gray-900 uppercase" 
            style={{ 
              fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
              letterSpacing: '-0.025em'
            }}
          >
            QR CODE GEN.
          </h1>
        </div>
        <QRCodeGenerator />
      </div>
    </div>
  );
}
