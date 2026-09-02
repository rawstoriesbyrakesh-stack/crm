import React, { useState, useEffect } from 'react';
import {
  FileText, Plus, Search, Send, Download, Check, Eye, Trash2, Edit3,
  Copy, ArrowLeft, DollarSign, Calendar, MapPin, User, Mail, Phone,
  Sparkles, CheckCircle2, AlertCircle, Clock, ShieldCheck, Printer,
  Globe, Upload, X, Link, Code, Palette, FilePlus, ExternalLink
} from 'lucide-react';
import { rawStoriesApiUrl } from '../api/rawStoriesBackend';

interface ProposalItem {
  id: string;
  name: string;
  description: string;
  price: number;
}

interface Proposal {
  id: string;
  title: string;
  eventType: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  eventDate: string;
  eventLocation: string;
  items: ProposalItem[];
  discount: number; // percentage
  tax: number; // percentage (e.g. 18 for GST)
  terms: string;
  paymentTerms: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Declined';
  createdAt: string;
  customPdfUrl?: string;
  customPdfName?: string;
}

interface Template {
  id: string;
  title: string;
  eventType: string;
  priceEstimate: number;
  items: { id: string; name: string; description: string; price: number }[];
  terms: string;
  paymentTerms: string;
  isCustom?: boolean;
}

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'template_wedding',
    title: 'Grand Wedding Photography & Cinematography',
    eventType: 'Wedding',
    priceEstimate: 185000,
    items: [
      { id: '1', name: 'Pre-Wedding Shoot', description: 'Full day outdoor shoot with 2 location changes & drone coverage', price: 35000 },
      { id: '2', name: 'Candid & Traditional Photography', description: 'Coverage for Haldi, Mehendi, Sangeet, Wedding & Reception (3 days)', price: 75000 },
      { id: '3', name: 'Cinematic 4K Video & Drone Highlights', description: '3-minute teaser + 30-minute cinematic feature film with 4K drone', price: 55000 },
      { id: '4', name: 'Premium Photo Albums', description: '2 Handcrafted luxury flush-mount albums (300 pages total)', price: 20000 },
    ],
    terms: '50% advance to confirm booking. 40% on event date. 10% upon final delivery. Raw files provided on client drive.',
    paymentTerms: '30% Booking Deposit | 50% Event Day | 20% Album Delivery',
  },
  {
    id: 'template_birthday',
    title: 'Birthday & Family Celebration Package',
    eventType: 'Birthday',
    priceEstimate: 35000,
    items: [
      { id: '1', name: 'Event Photography (5 Hours)', description: 'Candid and family portrait coverage throughout the event', price: 20000 },
      { id: '2', name: 'Highlight Video & Reel', description: '60-second trending Instagram Reel + 3-minute event recap', price: 10000 },
      { id: '3', name: 'Digital Delivery & Edits', description: '150 color-corrected high-resolution digital photos via online gallery', price: 5000 },
    ],
    terms: 'Full payment required before delivery of edited photos. Booking confirmed upon 40% advance.',
    paymentTerms: '40% Booking Deposit | 60% Event Completion',
  },
  {
    id: 'template_corporate',
    title: 'Corporate & Brand Event Coverage',
    eventType: 'Corporate',
    priceEstimate: 65000,
    items: [
      { id: '1', name: 'Full-Day Event Coverage', description: 'Keynotes, panel discussions, networking & gala dinner coverage', price: 35000 },
      { id: '2', name: 'Executive Headshots Session', description: 'On-site mobile studio lighting setup for leadership team headshots', price: 18000 },
      { id: '3', name: '24-Hour Express Highlights Delivery', description: 'Same-day social media teaser images + 24-hour press release photos', price: 12000 },
    ],
    terms: 'Payment due within 15 days of invoice date. Commercial usage rights included.',
    paymentTerms: '50% Advance | 50% Upon Express Delivery',
  },
  {
    id: 'template_fashion',
    title: 'Fashion & Model Portfolio Shoot',
    eventType: 'Fashion',
    priceEstimate: 28000,
    items: [
      { id: '1', name: 'Studio & Outdoor Session (4 Looks)', description: 'Creative direction, 4 outfit changes, professional lighting setup', price: 18000 },
      { id: '2', name: 'High-End Retouching', description: '15 skin-retouched magazine quality images', price: 7000 },
      { id: '3', name: 'Digital Comp Card', description: 'Designed digital composite card ready for agency submission', price: 3000 },
    ],
    terms: 'Retouching turn-around 7 business days from selection date.',
    paymentTerms: '50% Booking | 50% Shoot Completion',
  },
  {
    id: 'template_custom',
    title: 'Custom Event Photography & Videography',
    eventType: 'Custom',
    priceEstimate: 0,
    items: [
      { id: '1', name: 'Event Coverage', description: 'Photography / Videography services as agreed', price: 0 },
    ],
    terms: 'Terms to be agreed upon project confirmation.',
    paymentTerms: '50% Advance | 50% Final Delivery',
  },
];

const LOCAL_PROPOSALS_KEY = 'rawstories_saved_proposals_v1';
const LOCAL_CUSTOM_TEMPLATES_KEY = 'rawstories_custom_templates_v1';

export default function Proposals() {
  const [proposals, setProposals] = useState<Proposal[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_PROPOSALS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [customTemplates, setCustomTemplates] = useState<Template[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_CUSTOM_TEMPLATES_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [view, setView] = useState<'list' | 'editor' | 'preview'>('list');
  const [currentProposal, setCurrentProposal] = useState<Proposal | null>(null);

  // Quotation Visual Design Theme: 'signature' (Dark Gold), 'editorial' (Light Luxury), 'neon' (Modern Cyan)
  const [quotationTheme, setQuotationTheme] = useState<'signature' | 'editorial' | 'neon'>('signature');

  // Fetch saved proposals from MongoDB on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(rawStoriesApiUrl('/default/listproposals'));
        const data = await res.json().catch(() => null);
        if (data?.success && Array.isArray(data.proposals) && data.proposals.length > 0) {
          const mapped: Proposal[] = data.proposals.map((p: any) => ({
            id: p.proposalId || p.id || `prop_${Date.now()}`,
            title: p.title || 'Untitled Proposal',
            eventType: p.eventType || 'Custom',
            clientName: p.clientName || '',
            clientEmail: p.clientEmail || '',
            clientPhone: p.clientPhone || '',
            eventDate: p.eventDate || '',
            eventLocation: p.eventLocation || '',
            items: p.items || [],
            discount: p.discount || 0,
            tax: p.tax || 18,
            terms: p.terms || '',
            paymentTerms: p.paymentTerms || '',
            status: p.status || 'Draft',
            createdAt: p.createdAt || new Date().toISOString(),
            customPdfUrl: p.customPdfUrl,
            customPdfName: p.customPdfName,
          }));
          setProposals(mapped);
        }
      } catch (err) {
        console.warn('Could not fetch proposals from DB, using local storage:', err);
      }
    })();
  }, []);

  // Online Template Import Modal States
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState<'url' | 'paste' | 'pdf'>('url');
  const [importUrl, setImportUrl] = useState('');
  const [importJsonText, setImportJsonText] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState<{ id: string; msg: string; type: string }[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);

  const notify = (msg: string, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    setNotifications((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 4000);
  };

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_PROPOSALS_KEY, JSON.stringify(proposals));
    } catch {}
  }, [proposals]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_CUSTOM_TEMPLATES_KEY, JSON.stringify(customTemplates));
    } catch {}
  }, [customTemplates]);

  const allTemplates = [...DEFAULT_TEMPLATES, ...customTemplates];

  const handleSelectTemplate = (template: Template) => {
    const newProposal: Proposal = {
      id: `prop_${Date.now()}`,
      title: template.title,
      eventType: template.eventType,
      clientName: '',
      clientEmail: '',
      clientPhone: '',
      eventDate: new Date().toISOString().split('T')[0],
      eventLocation: '',
      items: template.items.map((it) => ({ ...it, id: `item_${Math.random().toString(36).substr(2, 5)}` })),
      discount: 0,
      tax: 18, // GST default
      terms: template.terms,
      paymentTerms: template.paymentTerms,
      status: 'Draft',
      createdAt: new Date().toISOString(),
    };
    setCurrentProposal(newProposal);
    setView('editor');
  };

  // Robust Helper to validate and save parsed template object from JSON / Objects / Text
  const saveImportedTemplate = (data: any, fallbackTitle?: string) => {
    if (!data) {
      throw new Error('Empty template file');
    }

    let itemsRaw: any[] = [];
    let title = fallbackTitle || 'Imported Custom Template';
    let eventType = 'Custom';
    let terms = 'Terms to be agreed upon confirmation.';
    let paymentTerms = '50% Booking | 50% Final Delivery';

    if (Array.isArray(data)) {
      itemsRaw = data;
    } else if (typeof data === 'object') {
      title = data.title || data.name || data.templateName || fallbackTitle || 'Imported Custom Template';
      eventType = data.eventType || data.type || data.category || 'Custom';
      terms = data.terms || terms;
      paymentTerms = data.paymentTerms || data.payment || paymentTerms;

      if (Array.isArray(data.items)) itemsRaw = data.items;
      else if (Array.isArray(data.deliverables)) itemsRaw = data.deliverables;
      else if (Array.isArray(data.services)) itemsRaw = data.services;
      else if (Array.isArray(data.packages)) itemsRaw = data.packages;
      else if (Array.isArray(data.data)) itemsRaw = data.data;
      else if (Array.isArray(data.rows)) itemsRaw = data.rows;
      else {
        itemsRaw = [data];
      }
    }

    if (itemsRaw.length === 0) {
      itemsRaw = [{ name: title, description: 'Imported service package', price: 0 }];
    }

    const items: ProposalItem[] = itemsRaw.map((it: any, idx: number) => ({
      id: `it_${Date.now()}_${idx}`,
      name: String(it.name || it.title || it.label || it.service || it.package || `Service ${idx + 1}`),
      description: String(it.description || it.details || it.scope || it.desc || ''),
      price: Number(it.price || it.cost || it.amount || it.rate) || 0,
    }));

    const priceEstimate = items.reduce((acc, it) => acc + (it.price || 0), 0);
    const newTemplate: Template = {
      id: `tmpl_custom_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      title,
      eventType,
      priceEstimate: Number(data.priceEstimate) || priceEstimate,
      items,
      terms,
      paymentTerms,
      isCustom: true,
    };

    setCustomTemplates((prev) => [newTemplate, ...prev]);
    setShowImportModal(false);
    setImportUrl('');
    setImportJsonText('');
    notify(`Successfully imported template "${title}"!`, 'success');

    // Auto open editor with newly imported template
    handleSelectTemplate(newTemplate);
  };

  const handleFetchOnlineUrl = async () => {
    if (!importUrl.trim()) {
      notify('Please enter a valid HTTP/HTTPS template URL', 'error');
      return;
    }
    setIsFetchingUrl(true);
    notify('Fetching online template...', 'info');

    try {
      const res = await fetch(importUrl.trim());
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load URL`);
      const data = await res.json();
      saveImportedTemplate(data);
    } catch (err: any) {
      notify(`Online import error: ${err.message}`, 'error');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const handleParsePastedJson = () => {
    if (!importJsonText.trim()) {
      notify('Please paste template JSON content', 'error');
      return;
    }
    try {
      const data = JSON.parse(importJsonText.trim());
      saveImportedTemplate(data);
    } catch (err: any) {
      notify(`JSON parse error: ${err.message}`, 'error');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        try {
          const data = JSON.parse(text);
          saveImportedTemplate(data, file.name.replace(/\.[^/.]+$/, ''));
        } catch {
          // If not valid JSON, treat lines as items
          const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
          const textItems = lines.map((line) => ({
            name: line.substring(0, 40),
            description: line,
            price: 0,
          }));
          saveImportedTemplate({ title: file.name.replace(/\.[^/.]+$/, ''), items: textItems }, file.name.replace(/\.[^/.]+$/, ''));
        }
      } catch (err: any) {
        notify(`File import error: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
  };

  // Upload Custom PDF / Image Design Template / Flyer
  const handlePdfDesignUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '');

      if (currentProposal && view === 'editor') {
        setCurrentProposal({
          ...currentProposal,
          customPdfUrl: dataUrl,
          customPdfName: file.name,
        });
        notify(`Attached PDF design flyer: ${file.name}`, 'success');
      } else {
        // Create new template entry from PDF file
        const newTemplate: Template = {
          id: `tmpl_pdf_${Date.now()}`,
          title: cleanTitle,
          eventType: 'PDF Design Flyer',
          priceEstimate: 0,
          items: [{ id: '1', name: 'Custom PDF Design Package', description: `Design flyer: ${file.name}`, price: 0 }],
          terms: 'Terms as per attached custom PDF design flyer.',
          paymentTerms: '50% Booking | 50% Final Delivery',
          isCustom: true,
        };

        setCustomTemplates((prev) => [newTemplate, ...prev]);

        const newProp: Proposal = {
          id: `prop_pdf_${Date.now()}`,
          title: cleanTitle,
          eventType: 'PDF Design Flyer',
          clientName: '',
          clientEmail: '',
          clientPhone: '',
          eventDate: new Date().toISOString().split('T')[0],
          eventLocation: '',
          items: newTemplate.items,
          discount: 0,
          tax: 18,
          terms: newTemplate.terms,
          paymentTerms: newTemplate.paymentTerms,
          status: 'Draft',
          createdAt: new Date().toISOString(),
          customPdfUrl: dataUrl,
          customPdfName: file.name,
        };

        setCurrentProposal(newProp);
        setView('editor');
        setShowImportModal(false);
        notify(`Imported PDF template "${cleanTitle}" successfully!`, 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddItem = () => {
    if (!currentProposal) return;
    const newItem: ProposalItem = {
      id: `item_${Date.now()}`,
      name: 'New Service / Deliverable',
      description: 'Description of service',
      price: 5000,
    };
    setCurrentProposal({
      ...currentProposal,
      items: [...currentProposal.items, newItem],
    });
  };

  const handleRemoveItem = (itemId: string) => {
    if (!currentProposal) return;
    setCurrentProposal({
      ...currentProposal,
      items: currentProposal.items.filter((i) => i.id !== itemId),
    });
  };

  const handleItemChange = (itemId: string, field: keyof ProposalItem, value: any) => {
    if (!currentProposal) return;
    setCurrentProposal({
      ...currentProposal,
      items: currentProposal.items.map((it) => (it.id === itemId ? { ...it, [field]: value } : it)),
    });
  };

  // Calculations
  const calculateSubtotal = (items: ProposalItem[]) => items.reduce((acc, item) => acc + (Number(item.price) || 0), 0);
  const calculateDiscountAmount = (subtotal: number, discountPercent: number) => (subtotal * (discountPercent || 0)) / 100;
  const calculateTaxAmount = (taxable: number, taxPercent: number) => (taxable * (taxPercent || 0)) / 100;
  const calculateGrandTotal = (prop: Proposal) => {
    const subtotal = calculateSubtotal(prop.items);
    const discountAmt = calculateDiscountAmount(subtotal, prop.discount);
    const taxable = subtotal - discountAmt;
    const taxAmt = calculateTaxAmount(taxable, prop.tax);
    return Math.round(taxable + taxAmt);
  };

  const handleSaveProposal = async () => {
    if (!currentProposal) return;
    if (!currentProposal.clientName.trim()) {
      notify('Please enter a Client Name before saving', 'error');
      return;
    }

    setProposals((prev) => {
      const idx = prev.findIndex((p) => p.id === currentProposal.id);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = currentProposal;
        return copy;
      }
      return [currentProposal, ...prev];
    });

    try {
      await fetch(rawStoriesApiUrl('/default/saveproposal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: currentProposal.id,
          ...currentProposal,
        }),
      });
      notify('Proposal saved to database successfully!', 'success');
    } catch (err) {
      notify('Proposal saved locally!', 'success');
    }
  };

  const handleSendEmailQuotation = async () => {
    if (!currentProposal) return;
    if (!currentProposal.clientEmail.trim()) {
      notify('Please enter a valid Client Email to send quotation', 'error');
      return;
    }

    setSendingEmail(true);
    notify(`Sending quotation email to ${currentProposal.clientEmail}...`, 'info');

    const grandTotal = calculateGrandTotal(currentProposal);
    const subtotal = calculateSubtotal(currentProposal.items);

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0b0f19; color: #ffffff; padding: 30px; border-radius: 16px;">
        <h2 style="color: #f59e0b; margin-top: 0;">Raw Stories by Rakesh</h2>
        <p style="font-size: 14px; color: #94a3b8;">Event Quotation for <strong>${currentProposal.clientName}</strong></p>
        <hr style="border-color: #334155; margin: 20px 0;" />
        
        <h3 style="color: #38bdf8;">${currentProposal.title}</h3>
        <p><strong>Date:</strong> ${currentProposal.eventDate}</p>
        <p><strong>Location:</strong> ${currentProposal.eventLocation || 'TBD'}</p>
        
        <h4 style="color: #f59e0b; margin-top: 25px;">Scope of Services & Deliverables</h4>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #1e293b; color: #cbd5e1; text-align: left;">
              <th style="padding: 10px;">Service</th>
              <th style="padding: 10px;">Description</th>
              <th style="padding: 10px; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${currentProposal.items.map(it => `
              <tr style="border-bottom: 1px solid #334155;">
                <td style="padding: 10px; font-weight: bold;">${it.name}</td>
                <td style="padding: 10px; color: #94a3b8; font-size: 13px;">${it.description}</td>
                <td style="padding: 10px; text-align: right; color: #34d399; font-weight: bold;">₹${Number(it.price).toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="background: #1e293b; padding: 15px; border-radius: 12px; text-align: right; font-size: 16px;">
          <p style="margin: 4px 0;">Subtotal: <strong>₹${subtotal.toLocaleString('en-IN')}</strong></p>
          ${currentProposal.discount > 0 ? `<p style="margin: 4px 0; color: #f43f5e;">Discount (${currentProposal.discount}%): -₹${calculateDiscountAmount(subtotal, currentProposal.discount).toLocaleString('en-IN')}</p>` : ''}
          ${currentProposal.tax > 0 ? `<p style="margin: 4px 0; color: #94a3b8;">Tax/GST (${currentProposal.tax}%): +₹${calculateTaxAmount(subtotal - calculateDiscountAmount(subtotal, currentProposal.discount), currentProposal.tax).toLocaleString('en-IN')}</p>` : ''}
          <p style="font-size: 20px; color: #f59e0b; font-weight: bold; margin-top: 10px;">Grand Total: ₹${grandTotal.toLocaleString('en-IN')}</p>
        </div>

        <div style="margin-top: 25px; font-size: 13px; color: #94a3b8;">
          <p><strong>Payment Terms:</strong> ${currentProposal.paymentTerms}</p>
          <p><strong>Terms:</strong> ${currentProposal.terms}</p>
        </div>

        <p style="margin-top: 30px; text-align: center; color: #64748b; font-size: 12px;">Raw Stories by Rakesh • High Quality Memories</p>
      </div>
    `;

    try {
      const res = await fetch(rawStoriesApiUrl('/default/mailsend'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: currentProposal.clientEmail,
          subject: `Quotation: ${currentProposal.title} - Raw Stories by Rakesh`,
          proposalId: currentProposal.id,
          html: emailHtml,
        }),
      });

      if (res.ok) {
        const updatedProp: Proposal = { ...currentProposal, status: 'Sent' };
        setCurrentProposal(updatedProp);
        setProposals((prev) => prev.map((p) => (p.id === updatedProp.id ? updatedProp : p)));
        notify(`Quotation successfully sent to ${currentProposal.clientEmail}!`, 'success');
      } else {
        notify('Failed to send email. Please try again.', 'error');
      }
    } catch (err: any) {
      notify(`Email dispatch failed: ${err.message}`, 'error');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleCopyWhatsApp = () => {
    if (!currentProposal) return;
    const grandTotal = calculateGrandTotal(currentProposal);
    const msg = `*Quotation from Raw Stories by Rakesh*\n\n` +
      `*Client:* ${currentProposal.clientName || 'Valued Client'}\n` +
      `*Event:* ${currentProposal.title}\n` +
      `*Date:* ${currentProposal.eventDate}\n\n` +
      `*Services & Scope:*\n` +
      currentProposal.items.map((it) => `• ${it.name}: ₹${Number(it.price).toLocaleString('en-IN')}`).join('\n') +
      `\n\n*Grand Total:* ₹${grandTotal.toLocaleString('en-IN')}\n\n` +
      `*Payment Schedule:* ${currentProposal.paymentTerms}\n\n` +
      `Thank you! Looking forward to capturing your special memories.`;

    navigator.clipboard.writeText(msg);
    notify('WhatsApp Quotation message copied to clipboard!', 'success');
  };

  const handleDeleteProposal = async (id: string) => {
    setProposals((prev) => prev.filter((p) => p.id !== id));
    try {
      await fetch(rawStoriesApiUrl('/default/deleteproposal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: id }),
      });
    } catch {}
    notify('Proposal deleted', 'info');
  };

  const filteredProposals = proposals.filter((p) => {
    const matchesSearch = p.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.eventType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'All' || p.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Dedicated Print trigger to ensure perfect A4 print formatting
  const handleTriggerPrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen text-slate-100 p-4 sm:p-8" style={{ background: '#0b0f19', fontFamily: "'Inter', sans-serif" }}>
      {/* Explicit Print CSS stylesheet for perfect A4 output */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 10mm 12mm 10mm 12mm;
        }

        @media print {
          html, body {
            background: #ffffff !important;
            color: #0f172a !important;
            font-size: 11pt !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          /* Hide sidebar, navigation, headers, buttons, devtools, toast messages */
          aside, nav, header, button, .no-print, [role="status"], #root > div > aside {
            display: none !important;
            visibility: hidden !important;
          }

          /* Reset layout container */
          .min-h-screen {
            background: #ffffff !important;
            padding: 0 !important;
          }

          #quotation-print-area {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            color: #0f172a !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          #quotation-print-area * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Force clean light backgrounds and high-contrast dark text on white paper */
          #quotation-print-area .bg-slate-950,
          #quotation-print-area .bg-slate-900,
          #quotation-print-area .bg-slate-900\/90,
          #quotation-print-area .bg-slate-950\/80,
          #quotation-print-area .bg-slate-950\/60 {
            background-color: #f1f5f9 !important;
            border-color: #cbd5e1 !important;
          }

          /* Force all text colors to dark readable tones for print */
          #quotation-print-area p,
          #quotation-print-area span,
          #quotation-print-area td,
          #quotation-print-area th,
          #quotation-print-area div {
            color: #0f172a !important;
          }

          /* Accents */
          #quotation-print-area .text-slate-400,
          #quotation-print-area .text-slate-500 {
            color: #334155 !important;
          }
          #quotation-print-area .text-amber-400,
          #quotation-print-area .text-amber-600,
          #quotation-print-area .text-amber-700 {
            color: #b45309 !important;
          }
          #quotation-print-area .text-cyan-400 {
            color: #0369a1 !important;
          }
          #quotation-print-area .text-emerald-400 {
            color: #047857 !important;
          }

          /* Table styling */
          #quotation-print-area table {
            border: 1px solid #94a3b8 !important;
          }
          #quotation-print-area thead {
            background-color: #e2e8f0 !important;
          }
          #quotation-print-area thead th {
            color: #0f172a !important;
            font-weight: 800 !important;
            border-bottom: 2px solid #64748b !important;
          }
          #quotation-print-area tbody tr {
            border-bottom: 1px solid #cbd5e1 !important;
          }

          /* Logo filter reset for white paper */
          #quotation-print-area img {
            filter: none !important;
          }
        }
      `}</style>

      {/* Toast Notifications */}
      <div className="fixed top-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none no-print">
        {notifications.map((n) => (
          <div key={n.id} className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold shadow-2xl backdrop-blur-xl border ${n.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200 shadow-emerald-950/50' : n.type === 'error' ? 'bg-red-950/90 border-red-500/40 text-red-200 shadow-red-950/50' : 'bg-slate-900/90 border-slate-700 text-white'}`}>
            <span>{n.msg}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Event Quotation & Proposals</h1>
              <p className="text-slate-400 text-xs sm:text-sm">Create, customize, and send event pricing proposals to clients</p>
            </div>
          </div>
        </div>

        {view !== 'list' && (
          <button onClick={() => setView('list')} className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all shadow-md">
            <ArrowLeft className="h-4 w-4" /> Back to Proposals List
          </button>
        )}
      </div>

      <div className="max-w-7xl mx-auto">
        {/* VIEW 1: PROPOSALS LIST & TEMPLATE SELECTOR */}
        {view === 'list' && (
          <div className="space-y-10">
            {/* Quick Template Selector Header */}
            <div>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-400" /> Start from Event Template ({allTemplates.length})
                </h2>

                <div className="flex items-center gap-2">
                  <button onClick={() => setShowImportModal(true)} className="flex items-center gap-2 px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 rounded-xl text-xs font-bold transition-all shadow-md">
                    <Globe className="h-4 w-4 text-amber-400" /> Import Online / PDF Template
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {allTemplates.map((tmpl) => (
                  <div key={tmpl.id} className="bg-slate-900/90 border border-slate-800 hover:border-amber-400/60 rounded-2xl p-5 flex flex-col justify-between transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-amber-500/10 group relative">
                    {tmpl.isCustom && (
                      <span className="absolute top-3 right-3 text-[9px] font-extrabold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 uppercase">
                        IMPORTED TEMPLATE
                      </span>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/30">
                          {tmpl.eventType}
                        </span>
                        {tmpl.priceEstimate > 0 && (
                          <span className="text-xs font-black text-emerald-400">
                            Est. ₹{tmpl.priceEstimate.toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-white group-hover:text-amber-300 transition-colors mb-2 pr-12">{tmpl.title}</h3>
                      <ul className="text-xs text-slate-400 space-y-1 mb-4">
                        {tmpl.items.slice(0, 3).map((it, idx) => (
                          <li key={idx} className="flex items-center gap-1.5 truncate">
                            <Check className="h-3.5 w-3.5 text-amber-400 shrink-0" /> {it.name}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button onClick={() => handleSelectTemplate(tmpl)} className="w-full py-2.5 bg-slate-800 hover:bg-amber-500 text-slate-200 hover:text-slate-950 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 border border-slate-700 hover:border-amber-400 shadow-md">
                      <Plus className="h-4 w-4" /> Use Template
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Saved Proposals Table */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Clock className="h-5 w-5 text-cyan-400" /> Saved & Sent Quotations ({filteredProposals.length})
                </h2>

                <div className="flex items-center gap-3">
                  {/* Search */}
                  <div className="relative flex-1 sm:w-64">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input type="text" placeholder="Search client or event..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-medium" />
                  </div>

                  {/* Filter */}
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-semibold focus:outline-none focus:border-amber-400">
                    <option value="All">All Status</option>
                    <option value="Draft">Draft</option>
                    <option value="Sent">Sent</option>
                    <option value="Accepted">Accepted</option>
                  </select>
                </div>
              </div>

              {filteredProposals.length === 0 ? (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center">
                  <FileText className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-300 font-bold text-base mb-1">No Quotations Found</p>
                  <p className="text-slate-500 text-xs">Select an event template above to create your first client quotation.</p>
                </div>
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                        <tr>
                          <th className="p-4">Client Name</th>
                          <th className="p-4">Event Package</th>
                          <th className="p-4">Event Date</th>
                          <th className="p-4">Amount</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-medium">
                        {filteredProposals.map((prop) => {
                          const grandTotal = calculateGrandTotal(prop);
                          return (
                            <tr key={prop.id} className="hover:bg-slate-800/50 transition-colors">
                              <td className="p-4">
                                <p className="font-bold text-white text-sm">{prop.clientName || 'Untitled Client'}</p>
                                <p className="text-slate-500 text-[11px]">{prop.clientEmail || 'No email provided'}</p>
                              </td>
                              <td className="p-4 font-semibold text-slate-200">
                                {prop.title}
                                {prop.customPdfName && (
                                  <span className="block text-[10px] text-cyan-400 font-mono mt-0.5">📎 {prop.customPdfName}</span>
                                )}
                              </td>
                              <td className="p-4 text-slate-400">{prop.eventDate}</td>
                              <td className="p-4 font-extrabold text-emerald-400 text-sm">₹{grandTotal.toLocaleString('en-IN')}</td>
                              <td className="p-4">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${prop.status === 'Sent' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40' : prop.status === 'Accepted' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                                  {prop.status}
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => { setCurrentProposal(prop); setView('preview'); }} title="Preview & Send" className="p-2 bg-slate-800 hover:bg-amber-500 text-slate-300 hover:text-slate-950 rounded-xl transition-all border border-slate-700">
                                    <Eye className="h-4 w-4" />
                                  </button>
                                  <button onClick={() => { setCurrentProposal(prop); setView('editor'); }} title="Edit" className="p-2 bg-slate-800 hover:bg-cyan-500 text-slate-300 hover:text-slate-950 rounded-xl transition-all border border-slate-700">
                                    <Edit3 className="h-4 w-4" />
                                  </button>
                                  <button onClick={() => handleDeleteProposal(prop.id)} title="Delete" className="p-2 bg-slate-800 hover:bg-rose-500 text-slate-300 hover:text-white rounded-xl transition-all border border-slate-700">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: QUOTATION EDITOR */}
        {view === 'editor' && currentProposal && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
              <div>
                <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Editing Proposal</span>
                <input type="text" value={currentProposal.title} onChange={(e) => setCurrentProposal({ ...currentProposal, title: e.target.value })} className="text-xl sm:text-2xl font-black text-white bg-transparent border-b border-slate-700 focus:border-amber-400 focus:outline-none w-full mt-1" />
              </div>

              <div className="flex items-center gap-3">
                <button onClick={handleSaveProposal} className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-all border border-slate-700 flex items-center gap-2 shadow-md">
                  <Check className="h-4 w-4" /> Save Draft
                </button>
                <button onClick={() => setView('preview')} className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold rounded-xl text-xs transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20">
                  <Eye className="h-4 w-4" /> Preview & Send Quote
                </button>
              </div>
            </div>

            {/* Custom PDF Design Flyer Upload Bar */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <FilePlus className="h-5 w-5 text-amber-400" />
                <div>
                  <p className="text-xs font-bold text-white">Custom PDF Design Template / Flyer Attachment</p>
                  <p className="text-[11px] text-slate-400">Attach a custom PDF flyer or brochure design to this quotation</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {currentProposal.customPdfName && (
                  <span className="text-xs font-mono text-cyan-300 bg-cyan-950/60 px-3 py-1.5 rounded-xl border border-cyan-800/40">
                    📎 {currentProposal.customPdfName}
                  </span>
                )}
                <label className="cursor-pointer px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold rounded-xl text-xs transition-all border border-slate-700 flex items-center gap-2">
                  <Upload className="h-4 w-4 text-amber-400" /> Upload PDF Design
                  <input type="file" accept=".pdf,image/*" onChange={handlePdfDesignUpload} className="hidden" />
                </label>
              </div>
            </div>

            {/* Client Details Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-950/80 p-5 rounded-2xl border border-slate-800">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1.5 mb-1.5">
                  <User className="h-3.5 w-3.5 text-amber-400" /> Client Name *
                </label>
                <input type="text" placeholder="e.g. Rahul Sharma" value={currentProposal.clientName} onChange={(e) => setCurrentProposal({ ...currentProposal, clientName: e.target.value })} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-medium" />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1.5 mb-1.5">
                  <Mail className="h-3.5 w-3.5 text-amber-400" /> Client Email
                </label>
                <input type="email" placeholder="client@gmail.com" value={currentProposal.clientEmail} onChange={(e) => setCurrentProposal({ ...currentProposal, clientEmail: e.target.value })} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-medium" />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1.5 mb-1.5">
                  <Calendar className="h-3.5 w-3.5 text-amber-400" /> Event Date
                </label>
                <input type="date" value={currentProposal.eventDate} onChange={(e) => setCurrentProposal({ ...currentProposal, eventDate: e.target.value })} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-medium" />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1.5 mb-1.5">
                  <MapPin className="h-3.5 w-3.5 text-amber-400" /> Location / Venue
                </label>
                <input type="text" placeholder="e.g. Hyderabad / Taj Falaknuma" value={currentProposal.eventLocation} onChange={(e) => setCurrentProposal({ ...currentProposal, eventLocation: e.target.value })} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-medium" />
              </div>
            </div>

            {/* Scope & Deliverables Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-white">Services & Deliverables Breakdown</h3>
                <button onClick={handleAddItem} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 rounded-xl text-xs font-bold transition-all">
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </button>
              </div>

              <div className="space-y-3">
                {currentProposal.items.map((item, idx) => (
                  <div key={item.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-slate-950/60 border border-slate-800 rounded-2xl">
                    <span className="text-xs font-extrabold text-slate-500 shrink-0 w-6">#{idx + 1}</span>
                    <div className="flex-1 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3 w-full">
                      <input type="text" value={item.name} onChange={(e) => handleItemChange(item.id, 'name', e.target.value)} placeholder="Service Title" className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-amber-400" />
                      <input type="text" value={item.description} onChange={(e) => handleItemChange(item.id, 'description', e.target.value)} placeholder="Description & Deliverable details" className="flex-[2] bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-medium focus:outline-none focus:border-amber-400" />
                    </div>
                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
                        <span className="text-xs font-bold text-emerald-400">₹</span>
                        <input type="number" value={item.price} onChange={(e) => handleItemChange(item.id, 'price', Number(e.target.value))} className="w-24 bg-transparent text-xs text-emerald-400 font-extrabold focus:outline-none" />
                      </div>
                      <button onClick={() => handleRemoveItem(item.id)} className="p-2 text-slate-500 hover:text-rose-400 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary & Adjustments */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-950 p-6 rounded-2xl border border-slate-800">
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Payment Schedule & Terms</h4>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 mb-1 block">Payment Milestones</label>
                  <input type="text" value={currentProposal.paymentTerms} onChange={(e) => setCurrentProposal({ ...currentProposal, paymentTerms: e.target.value })} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-amber-400" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 mb-1 block">Terms & Conditions</label>
                  <textarea rows={3} value={currentProposal.terms} onChange={(e) => setCurrentProposal({ ...currentProposal, terms: e.target.value })} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 font-medium focus:outline-none focus:border-amber-400" />
                </div>
              </div>

              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
                <h4 className="text-xs font-extrabold text-amber-400 uppercase tracking-wider border-b border-slate-800 pb-2">Price Breakdown</h4>

                <div className="space-y-2 text-xs font-semibold text-slate-300">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-extrabold text-white">₹{calculateSubtotal(currentProposal.items).toLocaleString('en-IN')}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Discount (%)</span>
                    <input type="number" min={0} max={100} value={currentProposal.discount} onChange={(e) => setCurrentProposal({ ...currentProposal, discount: Number(e.target.value) })} className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-right text-xs text-rose-400 font-bold" />
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Tax / GST (%)</span>
                    <input type="number" min={0} max={30} value={currentProposal.tax} onChange={(e) => setCurrentProposal({ ...currentProposal, tax: Number(e.target.value) })} className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-right text-xs text-cyan-400 font-bold" />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-sm font-black text-white">Grand Total</span>
                  <span className="text-2xl font-black text-amber-400">₹{calculateGrandTotal(currentProposal).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: LIVE PREVIEW & SEND MODAL */}
        {view === 'preview' && currentProposal && (
          <div className="space-y-6">
            {/* Actions & Visual Theme Selector Bar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl no-print">
              {/* Theme Switcher */}
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-bold text-slate-300">Design Theme:</span>
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button onClick={() => setQuotationTheme('signature')} className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${quotationTheme === 'signature' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}>
                    Dark Gold
                  </button>
                  <button onClick={() => setQuotationTheme('editorial')} className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${quotationTheme === 'editorial' ? 'bg-white text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}>
                    Light Luxury
                  </button>
                  <button onClick={() => setQuotationTheme('neon')} className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${quotationTheme === 'neon' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}>
                    Modern Cyan
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button onClick={handleTriggerPrint} className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all shadow-md">
                  <Printer className="h-4 w-4" /> Print / PDF (A4)
                </button>
                <button onClick={handleCopyWhatsApp} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md">
                  <Send className="h-4 w-4" /> Share WhatsApp
                </button>
                <button onClick={handleSendEmailQuotation} disabled={sendingEmail} className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50">
                  {sendingEmail ? <div className="w-4 h-4 border-2 border-slate-950/40 border-t-slate-950 rounded-full animate-spin" /> : <Mail className="h-4 w-4" />}
                  <span>{sendingEmail ? 'Sending...' : 'Send Quotation Email'}</span>
                </button>
              </div>
            </div>

            {/* Document Printable Sheet */}
            <div
              id="quotation-print-area"
              className={`rounded-3xl p-8 sm:p-12 shadow-2xl max-w-4xl mx-auto space-y-8 transition-all border ${
                quotationTheme === 'editorial'
                  ? 'bg-white text-slate-900 border-slate-200 print-bg-card'
                  : quotationTheme === 'neon'
                  ? 'bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-cyan-100 border-cyan-500/40'
                  : 'bg-slate-900 text-slate-200 border-slate-800'
              }`}
            >
              {/* Document Header */}
              <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b pb-8 ${quotationTheme === 'editorial' ? 'border-slate-200' : 'border-slate-800'}`}>
                <div>
                  <img
                    src="/rawstories-logo.png"
                    alt="Raw Stories by Rakesh"
                    className="h-12 object-contain mb-2"
                    style={{ filter: quotationTheme === 'editorial' ? 'none' : 'brightness(0) invert(1)' }}
                  />
                  <p className={`text-xs font-extrabold tracking-widest uppercase ${quotationTheme === 'editorial' ? 'text-amber-600' : quotationTheme === 'neon' ? 'text-cyan-400' : 'text-amber-400'}`}>
                    Raw Stories by Rakesh
                  </p>
                  <p className={`text-xs mt-1 ${quotationTheme === 'editorial' ? 'text-slate-500' : 'text-slate-400'}`}>
                    High Quality Photography & Cinematography
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <span className={`text-2xl font-black uppercase tracking-widest block ${quotationTheme === 'editorial' ? 'text-slate-900 font-serif' : quotationTheme === 'neon' ? 'text-cyan-400' : 'text-amber-400'}`}>
                    Quotation
                  </span>
                  <p className={`text-xs font-mono mt-1 ${quotationTheme === 'editorial' ? 'text-slate-500' : 'text-slate-400'}`}>Ref: #{currentProposal.id.slice(-6).toUpperCase()}</p>
                  <p className={`text-xs ${quotationTheme === 'editorial' ? 'text-slate-500' : 'text-slate-400'}`}>Date: {new Date(currentProposal.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Client Info Grid */}
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-6 p-6 rounded-2xl border ${quotationTheme === 'editorial' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                <div>
                  <p className={`text-[10px] font-extrabold uppercase tracking-wider mb-1 ${quotationTheme === 'editorial' ? 'text-amber-700' : 'text-amber-400'}`}>Prepared For</p>
                  <p className={`text-base font-extrabold ${quotationTheme === 'editorial' ? 'text-slate-900' : 'text-white'}`}>{currentProposal.clientName || 'Client Name'}</p>
                  <p className={`text-xs ${quotationTheme === 'editorial' ? 'text-slate-600' : 'text-slate-400'}`}>{currentProposal.clientEmail || 'Client Email'}</p>
                  <p className={`text-xs ${quotationTheme === 'editorial' ? 'text-slate-600' : 'text-slate-400'}`}>{currentProposal.clientPhone}</p>
                </div>
                <div>
                  <p className={`text-[10px] font-extrabold uppercase tracking-wider mb-1 ${quotationTheme === 'editorial' ? 'text-slate-700' : 'text-cyan-400'}`}>Event Details</p>
                  <p className={`text-sm font-bold ${quotationTheme === 'editorial' ? 'text-slate-900' : 'text-white'}`}>{currentProposal.title}</p>
                  <p className={`text-xs ${quotationTheme === 'editorial' ? 'text-slate-700' : 'text-slate-300'}`}>Date: {currentProposal.eventDate}</p>
                  <p className={`text-xs ${quotationTheme === 'editorial' ? 'text-slate-700' : 'text-slate-300'}`}>Venue: {currentProposal.eventLocation || 'To Be Finalized'}</p>
                </div>
              </div>

              {/* Scope Table */}
              <div>
                <h3 className={`text-xs font-extrabold uppercase tracking-wider mb-3 ${quotationTheme === 'editorial' ? 'text-slate-700' : 'text-slate-400'}`}>Scope of Deliverables & Services</h3>
                <div className={`border rounded-2xl overflow-hidden ${quotationTheme === 'editorial' ? 'border-slate-200' : 'border-slate-800'}`}>
                  <table className="w-full text-left text-xs">
                    <thead className={`font-bold uppercase border-b ${quotationTheme === 'editorial' ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'}`}>
                      <tr>
                        <th className="p-3.5">Service</th>
                        <th className="p-3.5">Description</th>
                        <th className="p-3.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y font-medium ${quotationTheme === 'editorial' ? 'divide-slate-200 text-slate-800' : 'divide-slate-800/60'}`}>
                      {currentProposal.items.map((it) => (
                        <tr key={it.id}>
                          <td className={`p-3.5 font-bold ${quotationTheme === 'editorial' ? 'text-slate-900' : 'text-white'}`}>{it.name}</td>
                          <td className={`p-3.5 ${quotationTheme === 'editorial' ? 'text-slate-600' : 'text-slate-400'}`}>{it.description}</td>
                          <td className={`p-3.5 text-right font-extrabold ${quotationTheme === 'editorial' ? 'text-slate-900' : 'text-emerald-400'}`}>₹{Number(it.price).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Custom PDF Attachment Card if uploaded */}
              {currentProposal.customPdfUrl && (
                <div className={`p-4 rounded-2xl border flex items-center justify-between ${quotationTheme === 'editorial' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-amber-500" />
                    <div>
                      <p className={`text-xs font-bold ${quotationTheme === 'editorial' ? 'text-slate-900' : 'text-white'}`}>Attached Custom PDF Design Flyer</p>
                      <p className="text-[11px] text-slate-500 font-mono">{currentProposal.customPdfName}</p>
                    </div>
                  </div>
                  <a href={currentProposal.customPdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-xl text-xs font-bold no-print">
                    <ExternalLink className="h-3.5 w-3.5" /> View PDF
                  </a>
                </div>
              )}

              {/* Total Calculation Sheet */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 pt-4">
                <div className="space-y-3 max-w-md">
                  <div>
                    <p className={`text-[11px] font-bold uppercase ${quotationTheme === 'editorial' ? 'text-slate-600' : 'text-slate-400'}`}>Payment Schedule</p>
                    <p className={`text-xs font-medium ${quotationTheme === 'editorial' ? 'text-slate-800' : 'text-slate-200'}`}>{currentProposal.paymentTerms}</p>
                  </div>
                  <div>
                    <p className={`text-[11px] font-bold uppercase ${quotationTheme === 'editorial' ? 'text-slate-600' : 'text-slate-400'}`}>Terms & Conditions</p>
                    <p className={`text-xs font-medium ${quotationTheme === 'editorial' ? 'text-slate-600' : 'text-slate-400'}`}>{currentProposal.terms}</p>
                  </div>
                </div>

                <div className={`p-5 rounded-2xl border min-w-[240px] text-right space-y-2 ${quotationTheme === 'editorial' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                  <div className={`flex justify-between text-xs ${quotationTheme === 'editorial' ? 'text-slate-600' : 'text-slate-400'}`}>
                    <span>Subtotal:</span>
                    <span className={`font-bold ${quotationTheme === 'editorial' ? 'text-slate-900' : 'text-slate-200'}`}>₹{calculateSubtotal(currentProposal.items).toLocaleString('en-IN')}</span>
                  </div>
                  {currentProposal.discount > 0 && (
                    <div className="flex justify-between text-xs text-rose-500">
                      <span>Discount ({currentProposal.discount}%):</span>
                      <span>-₹{calculateDiscountAmount(calculateSubtotal(currentProposal.items), currentProposal.discount).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {currentProposal.tax > 0 && (
                    <div className={`flex justify-between text-xs ${quotationTheme === 'editorial' ? 'text-slate-600' : 'text-cyan-400'}`}>
                      <span>Tax / GST ({currentProposal.tax}%):</span>
                      <span>+₹{calculateTaxAmount(calculateSubtotal(currentProposal.items) - calculateDiscountAmount(calculateSubtotal(currentProposal.items), currentProposal.discount), currentProposal.tax).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className={`pt-2 border-t flex justify-between text-base font-black ${quotationTheme === 'editorial' ? 'border-slate-300 text-slate-900' : 'border-slate-800 text-amber-400'}`}>
                    <span>Total Amount:</span>
                    <span>₹{calculateGrandTotal(currentProposal).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* IMPORT ONLINE TEMPLATE & PDF DESIGN MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md no-print">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6 relative">
            <button onClick={() => setShowImportModal(false)} className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Import Online Template or PDF Design</h3>
                <p className="text-xs text-slate-400">Fetch JSON from URL, upload custom PDF flyer, or paste JSON</p>
              </div>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-800">
              <button onClick={() => setImportTab('url')} className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${importTab === 'url' ? 'border-amber-400 text-amber-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
                <Link className="h-4 w-4" /> Fetch from URL
              </button>
              <button onClick={() => setImportTab('pdf')} className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${importTab === 'pdf' ? 'border-amber-400 text-amber-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
                <FilePlus className="h-4 w-4" /> Upload PDF Design
              </button>
              <button onClick={() => setImportTab('paste')} className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${importTab === 'paste' ? 'border-amber-400 text-amber-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
                <Code className="h-4 w-4" /> Paste JSON / Upload File
              </button>
            </div>

            {/* TAB 1: FETCH URL */}
            {importTab === 'url' && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 mb-1.5 block">Template JSON URL</label>
                  <input type="url" placeholder="https://raw.githubusercontent.com/.../wedding_template.json" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono" />
                </div>

                <button onClick={handleFetchOnlineUrl} disabled={isFetchingUrl || !importUrl.trim()} className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
                  {isFetchingUrl ? <div className="w-4 h-4 border-2 border-slate-950/40 border-t-slate-950 rounded-full animate-spin" /> : <Globe className="h-4 w-4" />}
                  <span>{isFetchingUrl ? 'Fetching Online Template...' : 'Fetch & Import Template'}</span>
                </button>
              </div>
            )}

            {/* TAB 2: UPLOAD PDF DESIGN FLYER */}
            {importTab === 'pdf' && (
              <div className="space-y-4">
                <div className="bg-slate-950 p-6 rounded-2xl border border-dashed border-slate-700 text-center space-y-3">
                  <Upload className="h-8 w-8 text-amber-400 mx-auto" />
                  <p className="text-xs font-bold text-white">Upload Custom PDF Design / Flyer</p>
                  <p className="text-[11px] text-slate-400">Select a `.pdf` file or custom design image from your computer to create a proposal with custom design flyer attached.</p>
                  <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md">
                    Choose PDF / Design File
                    <input type="file" accept=".pdf,image/*" onChange={handlePdfDesignUpload} className="hidden" />
                  </label>
                </div>
              </div>
            )}

            {/* TAB 3: PASTE / JSON / TXT FILE UPLOAD */}
            {importTab === 'paste' && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 mb-1.5 block">Upload .JSON / .TXT / .CSV File</label>
                  <input type="file" accept=".json,.txt,.csv" onChange={handleFileUpload} className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-amber-400 hover:file:bg-slate-700 cursor-pointer" />
                </div>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-slate-800"></div>
                  <span className="flex-shrink mx-2 text-[10px] font-bold text-slate-500 uppercase">OR PASTE JSON CODE</span>
                  <div className="flex-grow border-t border-slate-800"></div>
                </div>

                <div>
                  <textarea rows={5} placeholder='{\n  "title": "Destination Wedding",\n  "eventType": "Wedding",\n  "items": [{ "name": "4K Video", "description": "3-day shoot", "price": 50000 }]\n}' value={importJsonText} onChange={(e) => setImportJsonText(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-400" />
                </div>

                <button onClick={handleParsePastedJson} disabled={!importJsonText.trim()} className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl text-xs transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  <Upload className="h-4 w-4" /> Save Imported Template
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
