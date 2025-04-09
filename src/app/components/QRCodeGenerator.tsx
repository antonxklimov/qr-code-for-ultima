'use client';

import React, { useState, useRef, ChangeEvent } from 'react';
import QRCode from 'qrcode';
import { saveAs } from 'file-saver';
import { toPng } from 'html-to-image';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import Image from 'next/image';

// Define content type options
type ContentType = 'text' | 'url' | 'email' | 'phone' | 'wifi';
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

const QRCodeGenerator = () => {
  const [content, setContent] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingSingle, setIsGeneratingSingle] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [mode, setMode] = useState<Mode>('single');
  const [fileFormat, setFileFormat] = useState<'png' | 'eps'>('png');
  const [batchEntries, setBatchEntries] = useState<BatchEntry[]>([]);
  const [batchCodes, setBatchCodes] = useState<BatchQRCode[]>([]);
  const [uploadedItemsCount, setUploadedItemsCount] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showYandexMode, setShowYandexMode] = useState(false);
  const [showFileGuide, setShowFileGuide] = useState(false);
  const [contentType, setContentType] = useState<ContentType>('text');
  const [detectedType, setDetectedType] = useState<string | null>(null);
  const [useContentAsFilename, setUseContentAsFilename] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatContentByType = (content: string, type: ContentType): string => {
    switch (type) {
      case 'url':
        return content.match(/^https?:\/\//i) ? content : `https://${content}`;
      case 'email':
        return content.startsWith('mailto:') ? content : `mailto:${content}`;
      case 'phone':
        return content.startsWith('tel:') ? content : `tel:${content}`;
      case 'wifi':
        try {
          // If it's already a JSON string, parse and re-stringify to ensure proper format
          const wifiData = typeof content === 'string' ? JSON.parse(content) : content;
          return JSON.stringify(wifiData);
        } catch {
          // If parsing fails, return as is
          return content;
        }
      default:
        return content;
    }
  };

  const addUniqueCodeToContent = (content: string): string => {
    const uniqueCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${content}?code=${uniqueCode}`;
  };

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

  const generateQRCode = async (content: string, type: ContentType = 'text'): Promise<string> => {
    try {
      let formattedContent = content;
      
      // Apply content type formatting
      formattedContent = formatContentByType(formattedContent, type);
      
      // Generate QR code on canvas
      const canvas = document.createElement('canvas');
      await QRCode.toCanvas(canvas, formattedContent, {
        width: 800,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
      
      // Convert canvas to data URL
      const dataUrl = canvas.toDataURL('image/png');
      return dataUrl;
    } catch (err) {
      console.error('Error generating QR code:', err);
      throw err;
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      
      if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        const reader = new FileReader();
        reader.onload = async (e: ProgressEvent<FileReader>) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            // Filter out empty rows and get content from first column
            const validEntries = jsonData
              .filter((row: unknown) => Array.isArray(row) && row.length > 0 && row[0])
              .map((row: unknown) => {
                if (Array.isArray(row) && row[0]) {
                  return { content: String(row[0]), type: 'text' as ContentType };
                }
                return null;
              })
              .filter((entry): entry is BatchEntry => entry !== null);

            if (validEntries.length === 0) {
              setError('No valid content found in the Excel file');
              return;
            }

            setBatchEntries(validEntries);
            setUploadedItemsCount(validEntries.length);
          } catch (error) {
            setError('Error reading Excel file');
            console.error('Excel parsing error:', error);
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (fileExtension === 'txt') {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
          setError('File is empty');
          return;
        }

        const entries = lines.map(line => ({
          content: line.trim(),
          type: 'text' as ContentType
        }));

        setBatchEntries(entries);
        setUploadedItemsCount(entries.length);
      } else {
        setError('Unsupported file format. Please upload a .txt or .xlsx file');
      }
    } catch (error) {
      setError('Error reading file');
      console.error('File reading error:', error);
    }
  };

  const addBatchEntry = () => {
    setBatchEntries([...batchEntries, { content: '', type: 'text' }]);
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
      setError('');
      setIsGenerating(false);
    } catch (err) {
      console.error('Error generating batch QR codes:', err);
      setError('Failed to generate batch QR codes');
      setIsGenerating(false);
    }
  };

  const downloadQRCode = async () => {
    if (!qrCodeUrl) return;
    
    try {
      if (fileFormat === 'png') {
        // For PNG, we can use the dataUrl directly
        const link = document.createElement('a');
        link.href = qrCodeUrl;
        
        // Use content as filename if enabled, otherwise use default name
        if (useContentAsFilename && content) {
          const sanitizedContent = content.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 30);
          link.download = `${sanitizedContent}.${fileFormat}`;
        } else {
          link.download = `qr-code.${fileFormat}`;
        }
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // For EPS format, we need to convert the PNG to EPS
        const img = document.createElement('img');
        img.src = qrCodeUrl;
        await new Promise((resolve) => {
          img.onload = resolve;
        });
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        
        const epsData = await toPng(canvas, {
          quality: 1.0,
          pixelRatio: 2,
          skipFonts: true,
          style: {
            transform: 'scale(1)',
            transformOrigin: 'top left'
          }
        });
        
        const link = document.createElement('a');
        link.href = epsData;
        
        // Use content as filename if enabled, otherwise use default name
        if (useContentAsFilename && content) {
          const sanitizedContent = content.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 30);
          link.download = `${sanitizedContent}.${fileFormat}`;
        } else {
          link.download = `qr-code.${fileFormat}`;
        }
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Error downloading QR code:', error);
      setError('Failed to download QR code');
    }
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

  const downloadAllQRCodes = async () => {
    if (!batchCodes.length) return;
    
    setIsDownloadingAll(true);
    setError('Downloading all QR codes...');

    try {
      for (const code of batchCodes) {
        downloadBatchQRCode(code.dataUrl, code.content, code.type);
      }
    } finally {
      setError('');
      setIsDownloadingAll(false);
    }
  };

  const downloadAllQRCodesAsZip = async () => {
    if (!batchCodes.length) return;
    
    setIsDownloadingZip(true);
    setError('Creating zip file...');

    try {
      const zip = new JSZip();
      const promises = batchCodes.map(async (code, index) => {
        const filename = useContentAsFilename && code.content
          ? `${code.content.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 30)}.${fileFormat}`
          : `qr-code-${index + 1}.${fileFormat}`;

        if (fileFormat === 'png') {
          zip.file(filename, code.dataUrl.split(',')[1], { base64: true });
        } else {
          // For EPS format, we need to convert the PNG to EPS
          const img = document.createElement('img');
          img.src = code.dataUrl;
          await new Promise((resolve) => {
            img.onload = resolve;
          });
          
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          
          const epsData = await toPng(canvas, {
            quality: 1.0,
            pixelRatio: 2,
            skipFonts: true,
            style: {
              transform: 'scale(1)',
              transformOrigin: 'top left'
            }
          });
          
          zip.file(filename, epsData.split(',')[1], { base64: true });
        }
      });

      await Promise.all(promises);
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, 'qr-codes.zip');
      setError('');
    } catch (error) {
      console.error('Error creating zip file:', error);
      setError('Failed to create zip file');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const toggleMode = (newMode: Mode) => {
    setMode(newMode);
    setError('');
    setBatchCodes([]);
    setQrCodeUrl(null);
    
    // Reset batch entries when switching to batch mode
    if (newMode === 'batch' || newMode === 'yandex-ultima') {
      setBatchEntries([{ content: '', type: 'text' }]);
    }
  };

  // Helper function to get type label
  const getContentTypeLabel = (type: ContentType): string => {
    switch (type) {
      case 'url': return 'URL';
      case 'email': return 'Email';
      case 'phone': return 'Phone';
      case 'wifi': return 'WiFi';
      default: return 'Text';
    }
  };

  const toggleFileGuide = () => {
    setShowFileGuide(!showFileGuide);
  };

  // Add handler for text input that auto-detects type
  const handleTextChange = (e: ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setContent(inputValue);
    
    // Only auto-detect if there's content
    if (inputValue.trim()) {
      const detected = detectContentType(inputValue);
      setDetectedType(getContentTypeLabel(detected));
      setContentType(detected);
    } else {
      setDetectedType(null);
    }
  };

  const resetSingleQR = () => {
    setContent('');
    setQrCodeUrl(null);
    setError('');
  };

  const resetBatchQR = () => {
    setBatchEntries([{ content: '', type: 'text' }]);
    setBatchCodes([]);
    setError('');
    setUploadedItemsCount(0);
  };

  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
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
                    value={content}
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
                        {content.match(/^https?:\/\//i) ? content : `https://${content}`}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            <button
              onClick={() => generateQRCode(content, contentType)}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 shadow-sm mb-5 font-medium text-sm flex items-center justify-center"
            >
              {isGeneratingSingle ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating...
                </>
              ) : (
                'Generate QR Code'
              )}
            </button>
            
            <div className="flex flex-col items-center">
              <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-white shadow-sm max-w-xs mx-auto">
                {qrCodeUrl ? (
                  <div className="flex flex-col items-center">
                    <div className="relative w-40 h-40">
                      <Image 
                        src={qrCodeUrl} 
                        alt="Generated QR Code" 
                        fill
                        style={{ objectFit: 'contain' }}
                        priority
                      />
                    </div>
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                ) : (
                  <div className="p-4 flex flex-col items-center justify-center text-gray-400 h-40 w-40">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h10a2 2 0 012 2v14a2 2 0 01-2 2z" />
                    </svg>
                    <canvas ref={canvasRef} className="hidden" />
                    <p className="text-xs">QR code will appear here</p>
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
            <div className="mb-5">
              <div className="space-y-4 border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-medium text-gray-800">
                    {mode === 'batch' ? 'Batch QR Code Generator' : 'Yandex Ultima QR Code Generator'}
                  </h3>
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
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
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
                
                {showFileGuide && (
                  <div className="bg-blue-50 p-3 rounded-md text-xs text-blue-800 border border-blue-100">
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
                        <li className="text-blue-600 font-medium">Yandex Ultima mode: Each item will be used as a promocode in the URL</li>
                      )}
                    </ul>
                  </div>
                )}
                
                {/* File upload counter */}
                {uploadedItemsCount > 0 && (
                  <div className="bg-green-50 p-2 rounded-md text-xs text-green-700 border border-green-100 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Successfully uploaded <strong>{uploadedItemsCount}</strong> items from file</span>
                  </div>
                )}
                
                {/* Batch entries list */}
                <div className="space-y-2 mt-4">
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
                
                {/* Add more / Generate buttons */}
                <div className="flex justify-between pt-2">
                  <div className="flex space-x-2">
                    <button
                      onClick={addBatchEntry}
                      className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200 text-sm flex items-center font-medium"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      Add More Entries
                    </button>
                    {batchCodes.length > 0 && (
                      <button
                        onClick={resetBatchQR}
                        className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all duration-200 text-sm flex items-center font-medium"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        Clear All
                      </button>
                    )}
                  </div>
                  <button
                    onClick={generateBatchQRCodes}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 text-sm flex items-center shadow-sm font-medium"
                    disabled={isGenerating}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2V5h1v1H5zm-2 7a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zm2 2v-1h1v1H5zm8-12a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4a1 1 0 00-1-1h-3zm1 2V5h1v1h-1zm-2 7a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-3zm2 2v-1h1v1h-1z" clipRule="evenodd" />
                    </svg>
                    {isGenerating ? 'Generating...' : 'Generate All QR Codes'}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Batch results */}
            {batchCodes.length > 0 && (
              <div className="flex flex-col space-y-4">
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
                      onClick={downloadAllQRCodes}
                      className="bg-gray-800 text-white py-2 px-4 rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200 text-sm flex items-center"
                      disabled={isDownloadingAll}
                    >
                      {isDownloadingAll ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Downloading...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                          Download All
                        </>
                      )}
                    </button>
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
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                          </svg>
                          Download ZIP
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {batchCodes.map((code, index) => (
                    <div key={index} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                      <div className="flex flex-col items-center space-y-3">
                        <div className="relative w-32 h-32">
                          <Image 
                            src={code.dataUrl} 
                            alt={`QR Code ${index + 1}`} 
                            fill
                            style={{ objectFit: 'contain' }}
                            priority
                          />
                        </div>
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
                <button
                  onClick={() => setBatchCodes([])}
                  className="bg-blue-100 text-blue-700 py-2 px-4 rounded-lg hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 text-sm flex items-center self-start"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Create New Batch
                </button>
              </div>
            )}
          </>
        )}
      </>
    </div>
  );
};

export default QRCodeGenerator; 