'use client';

import { useState, useRef, ChangeEvent } from 'react';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

// Define content type options
type ContentType = 'text' | 'url' | 'email' | 'phone' | 'sms' | 'wifi';
// Define file format options
type FileFormat = 'png' | 'eps';
// Define mode options
type Mode = 'single' | 'batch' | 'yandex-ultima';

interface BatchEntry {
  content: string;
  type: ContentType;
}

interface BatchQRCode {
  content: string;
  type: ContentType;
  dataUrl: string;
  formattedContent: string; // The formatted content based on type
}

interface LoadingButtonProps {
  onClick: () => void;
  isLoading: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'danger';
  className?: string;
  icon?: React.ReactNode;
  loadingText?: string;
  children: React.ReactNode;
}

const LoadingButton: React.FC<LoadingButtonProps> = ({
  onClick,
  isLoading,
  disabled = false,
  variant = 'primary',
  className = '',
  icon,
  loadingText = 'Loading...',
  children
}) => {
  const baseStyles = "px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 text-sm flex items-center shadow-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed font-['Helvetica']";
  const variantStyles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
  };

  return (
    <button
      onClick={onClick}
      disabled={isLoading || disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          {loadingText}
        </>
      ) : (
        <>
          {icon && <span className="mr-2">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
};

const QRCodeGenerator = () => {
  const [text, setText] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<Mode>('single');
  const [batchCodes, setBatchCodes] = useState<BatchQRCode[]>([]);
  const [batchEntries, setBatchEntries] = useState<BatchEntry[]>([{ content: '', type: 'text' }]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isGeneratingSingle, setIsGeneratingSingle] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showFileGuide, setShowFileGuide] = useState(false);
  const [contentType, setContentType] = useState<ContentType>('text');
  const [fileFormat, setFileFormat] = useState<FileFormat>('png');
  const [useContentAsFilename, setUseContentAsFilename] = useState<boolean>(false);
  const [uploadedItemsCount, setUploadedItemsCount] = useState<{
    batch: number;
    'yandex-ultima': number;
  }>({
    batch: 0,
    'yandex-ultima': 0
  });
  const resultsRef = useRef<HTMLDivElement>(null);
  const [hasNewEntries, setHasNewEntries] = useState<boolean>(true);

  const formatContentByType = (content: string, type: ContentType): string => {
    switch (type) {
      case 'url':
        // Add https:// if not present and not starting with http:// already
        if (!content.match(/^https?:\/\//i)) {
          return `https://${content}`;
        }
        return content;
      case 'email':
        return `mailto:${content}`;
      case 'phone':
        return `tel:${content}`;
      case 'sms':
        return `sms:${content}`;
      case 'wifi':
        // Format: WIFI:T:WPA;S:SSID;P:password;;
        try {
          const wifiData = JSON.parse(content);
          return `WIFI:T:${wifiData.encryption || 'WPA'};S:${wifiData.ssid || ''};P:${wifiData.password || ''};;`;
        } catch {
          // If not valid JSON, assume it's already formatted or just text
          return content;
        }
      default:
        return content;
    }
  };

  const generateQRCode = async () => {
    try {
      let contentToEncode = '';
      
      // For all content types
      if (!text) {
        setError('Please enter some content');
        return;
      }
      contentToEncode = text;
      
      setError('');
      setIsGeneratingSingle(true);
      
      // Apply content type formatting
      const formattedContent = formatContentByType(contentToEncode, contentType);
      
      // Generate QR code on canvas
      if (canvasRef.current) {
        await QRCode.toCanvas(canvasRef.current, formattedContent, {
          width: 800,
          margin: 2
        });
      }
      
      // Generate data URL for download
      const url = await QRCode.toDataURL(formattedContent, {
        width: 800,
        margin: 2
      });
      setQrCodeUrl(url);
      setIsGeneratingSingle(false);
    } catch (err) {
      console.error('Error generating QR code:', err);
      setError('Failed to generate QR code');
      setIsGeneratingSingle(false);
    }
  };

  const addBatchEntry = () => {
    setBatchEntries([...batchEntries, { content: '', type: 'text' }]);
    setHasNewEntries(true);
  };

  const removeBatchEntry = (index: number) => {
    if (batchEntries.length > 1) {
      const newEntries = [...batchEntries];
      newEntries.splice(index, 1);
      setBatchEntries(newEntries);
    }
  };

  const updateBatchEntry = (index: number, field: keyof BatchEntry, value: string) => {
    const newEntries = [...batchEntries];
    if (field === 'type') {
      newEntries[index].type = value as ContentType;
    } else {
      newEntries[index].content = value;
    }
    setBatchEntries(newEntries);
    setHasNewEntries(true);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError('');
    setHasNewEntries(true);

    // Check file extension
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      // Handle Excel file
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const data = event.target?.result;
          if (!data) {
            setError('File appears to be empty');
            setIsUploading(false);
            return;
          }
          
          // Parse Excel file
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          // Filter out empty rows and extract content
          const contentRows = jsonData
            .filter((row: unknown) => row && Array.isArray(row) && row.length > 0 && row[0])
            .map((row: unknown) => {
              if (Array.isArray(row) && row[0]) {
                return row[0].toString().trim();
              }
              return '';
            });
          
          if (contentRows.length === 0) {
            setError('No content found in Excel file');
            setIsUploading(false);
            return;
          }
          
          // Create batch entries from Excel data
          const newEntries: BatchEntry[] = contentRows.map(content => ({
            content,
            type: 'text'
          }));
          
          setBatchEntries(newEntries);
          setUploadedItemsCount(prev => ({
            ...prev,
            [mode]: contentRows.length
          }));
          setIsUploading(false);
          
        } catch (err) {
          console.error('Error reading Excel file:', err);
          setError('Failed to read Excel file');
          setIsUploading(false);
        }
      };
      
      reader.onerror = () => {
        setError('Error reading Excel file');
        setIsUploading(false);
      };
      
      reader.readAsArrayBuffer(file);
    } else if (fileExtension === 'txt') {
      // Handle text file
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          if (!content) {
            setError('File appears to be empty');
            setIsUploading(false);
            return;
          }
          
          // Split by newlines and filter empty lines
          const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
          
          if (lines.length === 0) {
            setError('No content found in file');
            setIsUploading(false);
            return;
          }
          
          // Process lines from file
          const newEntries: BatchEntry[] = lines.map(line => ({
            content: line.trim(),
            type: 'text'
          }));
          
          setBatchEntries(newEntries);
          setUploadedItemsCount(prev => ({
            ...prev,
            [mode]: lines.length
          }));
          setIsUploading(false);
          
        } catch (err) {
          console.error('Error reading file:', err);
          setError('Failed to read file');
          setIsUploading(false);
        }
      };
      
      reader.onerror = () => {
        setError('Error reading file');
        setIsUploading(false);
      };
      
      reader.readAsText(file);
    } else {
      setError('Unsupported file format. Please upload a .txt or .xlsx file.');
      setIsUploading(false);
    }
    
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const generateBatchQRCodes = async () => {
    try {
      // Validate that we have at least one entry with content
      const hasContent = batchEntries.some(entry => entry.content.trim() !== '');
      
      if (!hasContent) {
        setError('Please enter content for at least one QR code');
        return;
      }

      setError('');
      setIsGenerating(true);
      setHasNewEntries(false);
      
      // Generate QR codes for each entry
      const batchResults: BatchQRCode[] = [];
      
      for (const entry of batchEntries) {
        if (entry.content.trim()) {
          let formattedContent = entry.content;
          
          // Special handling for Yandex Ultima mode
          if (mode === 'yandex-ultima') {
            formattedContent = `https://8jxm.adj.st/addpromocode?adj_t=rf7a0p4_8cgc7kg&ref=qr&code=${entry.content}`;
          } else {
            // Format content based on type
            formattedContent = formatContentByType(entry.content, entry.type);
          }
          
          const dataUrl = await QRCode.toDataURL(formattedContent, {
            width: 800,
            margin: 2
          });
          
          batchResults.push({
            content: entry.content,
            type: entry.type,
            dataUrl,
            formattedContent
          });
        }
      }
      
      setBatchCodes(batchResults);
      setIsGenerating(false);

      // Scroll to results after a short delay to ensure rendering is complete
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      console.error('Error generating batch QR codes:', err);
      setError('Failed to generate batch QR codes');
      setIsGenerating(false);
    }
  };

  const downloadQRCode = () => {
    if (!qrCodeUrl) return;
    
    const link = document.createElement('a');
    link.href = qrCodeUrl;
    
    // Use content as filename if enabled, otherwise use default name
    if (useContentAsFilename && text) {
      const sanitizedContent = text.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 30);
      link.download = `${sanitizedContent}.${fileFormat}`;
    } else {
      link.download = `qrcode.${fileFormat}`;
    }
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadBatchQRCode = (dataUrl: string, content: string, type: ContentType) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    
    // Use content as filename if enabled, otherwise use default name
    if (useContentAsFilename || mode === 'yandex-ultima') {
      const sanitizedContent = content.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 30);
      link.download = `${sanitizedContent}.${fileFormat}`;
    } else {
      // Create a sanitized filename from the content
      const typePrefix = type !== 'text' ? `${type}_` : '';
      const filename = content.slice(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
      link.download = `qrcode_${typePrefix}${filename}.${fileFormat}`;
    }
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAllQRCodesAsZip = async () => {
    if (!batchCodes.length) return;

    try {
      setIsDownloadingZip(true);
      const zip = new JSZip();

      for (const code of batchCodes) {
        // Create a filename based on the useContentAsFilename setting
        let filename;
        
        if (useContentAsFilename || mode === 'yandex-ultima') {
          // Use content directly as filename
          const sanitizedContent = code.content
            .replace(/[^a-z0-9]/gi, '_')
            .toLowerCase()
            .slice(0, 30);
          
          filename = `${sanitizedContent}.${fileFormat}`;
        } else {
          // Use the default naming convention
          const sanitizedContent = code.formattedContent
            .replace(/[^a-z0-9]/gi, '_')
            .toLowerCase()
            .slice(0, 30);
          
          filename = `${sanitizedContent}_${code.type}.${fileFormat}`;
        }

        if (fileFormat === 'png') {
          // For PNG, we can use the dataUrl directly
          const base64Data = code.dataUrl.split(',')[1];
          zip.file(filename, base64Data, { base64: true });
        } else if (fileFormat === 'eps') {
          // For EPS, we need to convert the PNG to EPS
          // Create a temporary canvas to draw the QR code
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          
          await new Promise((resolve, reject) => {
            img.onload = () => {
              canvas.width = img.width;
              canvas.height = img.height;
              ctx?.drawImage(img, 0, 0);
              resolve(null);
            };
            img.onerror = reject;
            img.src = code.dataUrl;
          });

          // Convert canvas to EPS
          const epsContent = await convertCanvasToEPS(canvas);
          zip.file(filename, epsContent);
        }
      }

      // Generate and download the zip file
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'qr_codes.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error creating zip file:', error);
      setError('Failed to create zip file');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const convertCanvasToEPS = async (canvas: HTMLCanvasElement): Promise<string> => {
    // This is a basic EPS conversion that creates a simple EPS file
    // For a production environment, you might want to use a more robust conversion library
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx?.getImageData(0, 0, width, height);
    
    if (!imageData) {
      throw new Error('Failed to get image data');
    }

    let eps = '%!PS-Adobe-3.0 EPSF-3.0\n';
    eps += `%%BoundingBox: 0 0 ${width} ${height}\n`;
    eps += '/scanline { % x y scanline\n';
    eps += '  /y exch def\n';
    eps += '  /x exch def\n';
    eps += '  x y moveto\n';
    eps += '  x 1 add y lineto\n';
    eps += '  stroke\n';
    eps += '} def\n';
    eps += '0.5 setlinewidth\n';
    eps += '0 setgray\n';

    // Convert image data to EPS
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const alpha = imageData.data[i + 3];
        if (alpha > 128) { // If pixel is not transparent
          eps += `${x} ${height - y} scanline\n`;
        }
      }
    }

    eps += 'showpage\n';
    return eps;
  };

  const toggleMode = (newMode: Mode) => {
    setMode(newMode);
    setError('');
    setBatchCodes([]);
    setQrCodeUrl('');
    setUploadedItemsCount({
      batch: 0,
      'yandex-ultima': 0
    });
    
    // Reset batch entries when switching to batch mode
    if (newMode === 'batch' || newMode === 'yandex-ultima') {
      setBatchEntries([{ content: '', type: 'text' }]);
    }
  };

  const toggleFileGuide = () => {
    setShowFileGuide(!showFileGuide);
  };

  // New function to auto-detect content type
  const detectContentType = (content: string): ContentType => {
    // If it looks like a URL
    if (content.match(/^(https?:\/\/|www\.)/i)) {
      return 'url';
    }
    
    // If it looks like an email
    if (content.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return 'email';
    }
    
    // If it looks like a phone number
    if (content.match(/^\+?[0-9\s\(\)\-]{8,20}$/)) {
      return 'phone';
    }
    
    // If it looks like JSON (for WiFi)
    if ((content.startsWith('{') && content.endsWith('}')) &&
        content.includes('ssid')) {
      return 'wifi';
    }
    
    // Default to text
    return 'text';
  };

  // Add handler for text input that auto-detects type
  const handleTextChange = (e: ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setText(inputValue);
    
    // Only auto-detect if there's content
    if (inputValue.trim()) {
      const detected = detectContentType(inputValue);
      setContentType(detected);
    }
  };

  const resetSingleQR = () => {
    setText('');
    setQrCodeUrl('');
    setError('');
  };

  const resetBatchQR = () => {
    setBatchEntries([{ content: '', type: 'text' }]);
    setBatchCodes([]);
    setError('');
    setUploadedItemsCount({
      batch: 0,
      'yandex-ultima': 0
    });
    setHasNewEntries(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const generateIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2V5h1v1H5zm-2 7a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zm2 2v-1h1v1H5zm8-12a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4a1 1 0 00-1-1h-3zm1 2V5h1v1h-1zm-2 7a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-3zm2 2v-1h1v1h-1z" clipRule="evenodd" />
    </svg>
  );

  const clearIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md font-['Helvetica']">
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      <>
        {/* Mode Toggle */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex rounded-full shadow-sm p-1 bg-gray-100">
            <button
              onClick={() => toggleMode('single')}
              className={`px-6 py-2 text-sm rounded-full transition-all duration-200 ${mode === 'single' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-200'}`}
            >
              Single
            </button>
            <button
              onClick={() => toggleMode('batch')}
              className={`px-6 py-2 text-sm rounded-full transition-all duration-200 ${mode === 'batch' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-200'}`}
            >
              Batch
            </button>
            <button
              onClick={() => toggleMode('yandex-ultima')}
              className={`px-6 py-2 text-sm rounded-full transition-all duration-200 ${mode === 'yandex-ultima' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-200'}`}
            >
              Yandex Ultima
            </button>
          </div>
        </div>

        {/* Single Mode */}
        {mode === 'single' ? (
          <>
            <div className="mb-5">
              <div className="space-y-3 border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
                <h3 className="text-base font-medium text-gray-800 mb-3">Create QR Code</h3>
                
                <div className="mb-4">
                  <input
                    type="text"
                    id="content-input"
                    value={text}
                    onChange={handleTextChange}
                    placeholder="Enter content for QR code"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all"
                  />
                </div>
                
                {contentType === 'url' && (
                  <div className="pt-1">
                    <p className="text-xs text-gray-600 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      Preview: <span className="font-mono bg-gray-100 p-1 rounded ml-1 text-xs inline-block mt-1">
                        {text.match(/^https?:\/\//i) ? text : `https://${text}`}
                      </span>
                    </p>
                  </div>
                )}

                <div className="flex justify-center mt-4 pt-4 border-t border-gray-100">
                  <LoadingButton
                    onClick={generateQRCode}
                    isLoading={isGeneratingSingle}
                    icon={generateIcon}
                    loadingText="Generating..."
                  >
                    Generate QR Code
                  </LoadingButton>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-center">
              <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-white shadow-sm max-w-xs mx-auto">
                {qrCodeUrl ? (
                  <div className="flex flex-col items-center">
                    <img src={qrCodeUrl} alt="Generated QR Code" className="w-40 h-40" />
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                ) : (
                  <div className="p-4 flex flex-col items-center justify-center text-gray-400 h-40 w-40 text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm6-2a1 1 0 11-2 0 1 1 0 012 0zm-.464 5.535a1 1 0 10-1.415-1.414 3 3 0 01-4.242 0 1 1 0 00-1.415 1.414 5 5 0 007.072 0z" clipRule="evenodd" />
                    </svg>
                    <canvas ref={canvasRef} className="hidden" />
                    <span className="text-xs">QR code will appear here</span>
                  </div>
                )}
              </div>
              
              {qrCodeUrl && (
                <div className="flex flex-col space-y-3 items-center">
                  <div className="flex items-center space-x-2 mb-2">
                    <label className="text-xs text-gray-600">File format:</label>
                    <select 
                      value={fileFormat} 
                      onChange={(e) => setFileFormat(e.target.value as FileFormat)}
                      className="text-xs border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="png">PNG</option>
                      <option value="eps">EPS</option>
                    </select>
                  </div>
                  <div className="flex items-center space-x-2 mb-2">
                    <input
                      type="checkbox"
                      id="use-content-filename"
                      checked={useContentAsFilename}
                      onChange={(e) => setUseContentAsFilename(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="use-content-filename" className="text-xs text-gray-600">
                      Use content as filename
                    </label>
                  </div>
                  <button
                    onClick={downloadQRCode}
                    className="bg-gray-800 text-white py-2 px-4 rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200 text-sm flex items-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    Download QR Code
                  </button>
                  
                  <button
                    onClick={resetSingleQR}
                    className="bg-blue-100 text-blue-700 py-2 px-4 rounded-lg hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 text-sm flex items-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                    </svg>
                    Create a New QR
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Batch Mode or Yandex Ultima Mode */}
            <div className="space-y-4">
              {/* Input and Controls Section */}
              <div className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-medium text-gray-800">
                      {mode === 'batch' ? 'Batch QR Code Generator' : 'Yandex Ultima QR Code Generator'}
                    </h3>
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      className="hidden"
                      accept=".txt, .xlsx, .xls"
                    />
                    <button
                      onClick={triggerFileUpload}
                      className={`px-3 py-1.5 rounded-lg flex items-center transition-all duration-200 text-xs font-medium ${isUploading ? 'bg-gray-400 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1'}`}
                      disabled={isUploading}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 001.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                      {isUploading ? 'Uploading...' : 'Upload File'}
                    </button>
                    <button
                      onClick={toggleFileGuide}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200 flex items-center text-xs font-medium focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      Format Guide
                    </button>
                  </div>
                </div>

                {mode === 'yandex-ultima' && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 mb-2 flex items-start space-x-2">
                    <svg className="h-3.5 w-3.5 text-blue-500 mt-0.5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div className="min-w-0">
                      <code className="text-[11px] bg-white px-1.5 py-0.5 rounded border border-blue-100 text-blue-800 block truncate">
                        https://8jxm.adj.st/addpromocode?adj_t=rf7a0p4_8cgc7kg&ref=qr&code=*promocode*
                      </code>
                    </div>
                  </div>
                )}

                {showFileGuide && (
                  <div className="bg-blue-50 p-3 rounded-md text-xs text-blue-800 border border-blue-100 mb-4">
                    <p className="font-medium mb-1 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      File Format Guide:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 mt-2">
                      <li>Upload a plain text (.txt) file or Excel (.xlsx, .xls) file</li>
                      <li>For text files: One item per line</li>
                      <li>For Excel files: Content should be in the first column of the first sheet</li>
                      <li>Empty lines/rows will be ignored</li>
                      <li>Content will be auto-detected (URLs, email addresses, etc.)</li>
                      <li>Example: each line/row can be a URL, text, email, phone number, etc.</li>
                      {mode === 'yandex-ultima' && (
                        <>
                          <li className="text-blue-600 font-medium">Yandex Ultima mode: Each item will be used as a promocode in the URL</li>
                          <li className="text-blue-600">URL format: https://8jxm.adj.st/addpromocode?adj_t=rf7a0p4_8cgc7kg&ref=qr&code=*promocode*</li>
                          <li className="text-blue-600">The *promocode* will be replaced with your actual promocode</li>
                        </>
                      )}
                    </ul>
                  </div>
                )}

                {uploadedItemsCount[mode] > 0 && (mode === 'batch' || mode === 'yandex-ultima') && (
                  <div className="bg-green-50 p-2 rounded-md text-xs text-green-700 border border-green-100 flex items-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 001.414 1.414l3-3a1 1 0 00-1.414-1.414z" clipRule="evenodd" />
                    </svg>
                    <span>Successfully uploaded <strong>{uploadedItemsCount[mode]}</strong> items from file</span>
                  </div>
                )}

                {/* Batch entries list */}
                <div className="space-y-2">
                  {batchEntries.map((entry, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={entry.content}
                        onChange={(e) => updateBatchEntry(index, 'content', e.target.value)}
                        placeholder={mode === 'yandex-ultima' ? "Enter promocode" : "Enter content"}
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all"
                      />
                      {batchEntries.length > 1 && (
                        <button
                          onClick={() => removeBatchEntry(index)}
                          className="text-red-500 hover:text-red-700 transition-colors p-1.5 rounded-md hover:bg-red-50"
                          aria-label="Remove"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Controls - Always with the input section */}
                <div className="flex justify-between mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={addBatchEntry}
                    className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200 text-sm flex items-center font-medium"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Add More Entries
                  </button>
                  <LoadingButton
                    onClick={hasNewEntries ? generateBatchQRCodes : resetBatchQR}
                    isLoading={isGenerating}
                    variant={hasNewEntries ? 'primary' : 'danger'}
                    icon={hasNewEntries ? generateIcon : clearIcon}
                    loadingText={hasNewEntries ? "Generating QR Codes..." : "Clearing..."}
                  >
                    {batchCodes.length === 0 ? 'Generate all' : (hasNewEntries ? 'Generate Some More' : 'Clear All')}
                  </LoadingButton>
                </div>
              </div>

              {/* Results Section */}
              {batchCodes.length > 0 && (
                <div ref={resultsRef} className="flex flex-col space-y-4 border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <label className="text-xs text-gray-600">File format:</label>
                        <select 
                          value={fileFormat} 
                          onChange={(e) => setFileFormat(e.target.value as FileFormat)}
                          className="text-xs border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="png">PNG</option>
                          <option value="eps">EPS</option>
                        </select>
                      </div>
                      {mode !== 'yandex-ultima' && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="batch-use-content-filename"
                            checked={useContentAsFilename}
                            onChange={(e) => setUseContentAsFilename(e.target.checked)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label htmlFor="batch-use-content-filename" className="text-xs text-gray-600">
                            Use content as filename
                          </label>
                        </div>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={downloadAllQRCodesAsZip}
                        className="bg-gray-800 text-white py-2 px-4 rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200 text-sm flex items-center"
                        disabled={isDownloadingZip}
                      >
                        {isDownloadingZip ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Creating ZIP...
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            Download all
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {batchCodes.map((code, index) => (
                      <div key={index} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                        <div className="flex flex-col items-center space-y-3">
                          <img src={code.dataUrl} alt={`QR Code ${index + 1}`} className="w-32 h-32" />
                          <div className="text-sm text-gray-600 text-center break-all">
                            {mode === 'yandex-ultima' ? code.content : code.formattedContent}
                          </div>
                          <button
                            onClick={() => downloadBatchQRCode(code.dataUrl, code.content, code.type)}
                            className="bg-gray-800 text-white py-2 px-4 rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200 text-sm flex items-center"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            Download
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </>
    </div>
  );
};

export default QRCodeGenerator; 