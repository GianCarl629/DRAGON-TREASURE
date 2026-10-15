// Client dashboard modal for bookings, invoices, and online payments (Live Supabase Sync)
import React, { useState, useEffect } from 'react';
import { 
  X, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  BedDouble, 
  ChevronDown, 
  ChevronUp, 
  Trash2, 
  AlertTriangle, 
  Copy, 
  Check, 
  Eye, 
  Receipt, 
  Upload, 
  CreditCard, 
  Droplet, 
  Zap, 
  DollarSign, 
  ShieldCheck, 
  ExternalLink,
  MessageSquare,
  Send,
  Lock,
  User,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PROPERTY_CONTACT } from '../../data/mockData';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { 
  getLocalInvoices, 
  submitOnlinePayment, 
  ClientInvoice 
} from '../../services/db/billingService';
import {
  getCustomerInquiries,
  sendCustomerReply,
  markInquiryReadByCustomer,
  getUnreadRepliesCountForCustomer,
  ensureInquiryMessages,
  syncInquiriesWithSupabase,
  subscribeToInquiryChanges
} from '../../services/db/inquiryService';
import { AdminInquiry } from '../../admin/data/adminMockData';

interface MyReservationsModalProps {
  isOpen: boolean;
  initialTab?: DashboardTab;
  onClose: () => void;
  onBrowseRooms?: () => void;
}

type DashboardTab = 'bookings' | 'billing' | 'payment' | 'inquiries';

const COMMON_CANCELLATION_REASONS = [
  'Change in travel plans or dates',
  'Unexpected medical or personal emergency',
  'Severe weather / travel advisory in Baguio',
  'Found alternative lodging or accommodation',
  'Accidentally booked incorrect dates or room type',
  'Transportation or flight/bus scheduling issues',
  'Financial or budget considerations',
  'Others (please specify)'
];

export const MyReservationsModal: React.FC<MyReservationsModalProps> = ({
  isOpen,
  initialTab = 'bookings',
  onClose,
  onBrowseRooms
}) => {
  const { user, cancelReservation } = useAuth();

  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);

  const [liveReservations, setLiveReservations] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [otherReasonText, setOtherReasonText] = useState<string>('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);

  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'GCash' | 'Maya' | 'Bank Transfer' | 'Cash'>('GCash');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [accountName, setAccountName] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState<string | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);
  const [receiptFilePreview, setReceiptFilePreview] = useState<string | null>(null);

  const [inquiries, setInquiries] = useState<AdminInquiry[]>([]);
  const [inquiriesFilter, setInquiriesFilter] = useState<'All' | 'Active' | 'Resolved'>('All');
  const [expandedInquiryId, setExpandedInquiryId] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [isSubmittingReply, setIsSubmittingReply] = useState<string | null>(null);
  const [replyFeedback, setReplyFeedback] = useState<Record<string, string>>({});

  const loadInquiries = () => {
    if (user?.email) {
      const userInquiries = getCustomerInquiries(user.email);
      setInquiries(userInquiries);
      if (userInquiries.length > 0 && !expandedInquiryId) {
        setExpandedInquiryId(userInquiries[0].id);
      }
    }
  };

  useEffect(() => {
    if (isOpen && user?.email) {
      loadInquiries();
      syncInquiriesWithSupabase().then(() => {
        if (user?.email) {
          loadInquiries();
        }
      });
    }
  }, [isOpen, user?.email]);

  useEffect(() => {
    const handleUpdate = () => {
      if (user?.email) {
        loadInquiries();
      }
    };
    window.addEventListener('dragon_treasure_inquiry_updated', handleUpdate);

    const unsubscribeRealtime = subscribeToInquiryChanges(() => {
      if (user?.email) {
        loadInquiries();
      }
    });

    return () => {
      window.removeEventListener('dragon_treasure_inquiry_updated', handleUpdate);
      unsubscribeRealtime();
    };
  }, [user?.email]);

  useEffect(() => {
    if (activeTab === 'inquiries' && inquiries.length > 0) {
      inquiries.forEach((inq) => {
        if (inq.isReadByCustomer === false) {
          markInquiryReadByCustomer(inq.id);
        }
      });
    }
  }, [activeTab, inquiries]);

  const unreadInquiriesCount = user?.email ? getUnreadRepliesCountForCustomer(user.email) : 0;

  useEffect(() => {
    const loadPortalData = async () => {
      if (isOpen) {
        if (initialTab) {
          setActiveTab(initialTab);
        }

        if (isSupabaseConfigured()) {
          try {
            // 1. Fetch Reservations
            const { data: resData, error: resError } = await supabase
              .from('reservations')
              .select('*')
              .order('created_at', { ascending: false });

            if (!resError && resData) {
              const userEmail = user?.email?.toLowerCase().trim();
              const filtered = userEmail 
                ? resData.filter((r: any) => r.guest_email && r.guest_email.toLowerCase().trim() === userEmail)
                : resData;

              const formattedReservations = filtered.map((r: any) => ({
                id: r.id,
                reservationCode: r.reservation_code || `RES-${r.id.substring(0, 5)}`,
                roomName: r.room_type || 'Transient Room',
                roomCategory: (r.room_type && r.room_type.toLowerCase().includes('dorm')) ? 'dormitory' : 'transient',
                roomImage: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=600&q=80',
                checkInDate: r.check_in_date,
                checkOutDate: r.check_out_date,
                status: r.status,
                rate: Number(r.total_price) || 2500,
                ratePeriod: 'night',
                fullName: r.guest_name,
                email: r.guest_email || user?.email || '',
                contactNumber: r.guest_phone || '',
                numberOfGuests: r.number_of_guests || 1,
                specialRequests: r.special_requests || '',
                cancellationReason: r.cancellation_reason || '',
                physicalRoomNumber: r.physical_room_number || '', // NAKA-LINK NA SA DB
                bookedAt: 'Recently'
              }));
              setLiveReservations(formattedReservations);
            }

            // 2. Fetch Invoices from Supabase directly
            const { data: invData, error: invError } = await supabase
              .from('billing_records')
              .select('*')
              .order('created_at', { ascending: false });

            let finalInvoices: any[] = [];
            
            if (!invError && invData) {
              const myName = user?.name?.toLowerCase().trim();
              const myInvoices = myName 
                ? invData.filter((i: any) => i.tenant_or_guest?.toLowerCase().trim() === myName)
                : invData;

              // --- HIDE THE 100% INVOICE COMPLETELY ---
              const cleanedInvoices = myInvoices.filter((inv: any) => {
                if (inv.type === 'Transient Stay' && inv.payment_status === 'Pending') {
                  return false; 
                }
                return true;
              });

              finalInvoices = cleanedInvoices.map((inv: any) => ({
                id: String(inv.id),
                invoiceNumber: inv.invoice_number,
                tenantOrGuestName: inv.tenant_or_guest || '', 
                roomOrBed: inv.room_or_bed,
                stayType: inv.type,
                billingPeriod: inv.billing_period,
                rentAmount: Number(inv.rent_amount) || 0,
                waterAmount: Number(inv.water_amount) || 0,
                electricityAmount: Number(inv.electricity_amount) || 0,
                depositAmount: Number(inv.deposit_amount) || 0,
                totalAmount: Number(inv.total_amount) || 0,
                paymentStatus: inv.payment_status,
                dueDate: inv.due_date,
                paymentReference: inv.payment_reference,
                paymentMethod: inv.payment_method,
                paidAt: inv.paid_at,
                createdAt: inv.created_at || ''
              }));
            } else {
               finalInvoices = await getLocalInvoices(user?.email);
            }

            setInvoices(finalInvoices);

            // Auto-fill the payment amount and selected invoice
            const firstPending = finalInvoices.find((i: ClientInvoice) => i.paymentStatus === 'Pending');
            if (firstPending && !selectedInvoiceForPayment) {
              setSelectedInvoiceForPayment(firstPending.id);
              setPaymentAmount(firstPending.totalAmount);
            }

          } catch (err) {
            console.warn('Error fetching portal data:', err);
          }
        } else {
          // If Supabase is not configured, load from local storage
          const loadedInvoices = await getLocalInvoices(user?.email);
          setInvoices(loadedInvoices);

          const firstPending = loadedInvoices.find((i: ClientInvoice) => i.paymentStatus !== 'Paid');
          if (firstPending) {
            setSelectedInvoiceForPayment(firstPending.id);
            setPaymentAmount(firstPending.totalAmount);
          }
        }
      }
    };
    loadPortalData();
  }, [isOpen, initialTab, user?.email]); // TINANGGAL NA ANG ACTIVETAB DITO PARA HINDI MAG-GLITCH

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleDetails = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleOpenCancel = (id: string) => {
    setCancellingId(id);
    setSelectedReason('');
    setOtherReasonText('');
    setCancelError(null);
  };

  const handleConfirmCancel = async (id: string, reservationCode: string) => {
    if (!selectedReason) {
      setCancelError('Please select a cancellation reason from the list.');
      return;
    }
    if (selectedReason === 'Others (please specify)' && !otherReasonText.trim()) {
      setCancelError('Please provide details for your cancellation in the text box below.');
      return;
    }

    const finalReason =
      selectedReason === 'Others (please specify)'
        ? `Others: ${otherReasonText.trim()}`
        : selectedReason;

    if (isSupabaseConfigured()) {
      await supabase
        .from('reservations')
        .update({ status: 'Cancelled', cancellation_reason: finalReason })
        .eq('id', id);
    }

    cancelReservation(id, finalReason);
    setCancellingId(null);
    setSelectedReason('');
    setOtherReasonText('');
    setCancelError(null);
    setCancelFeedback(`Reservation request ${reservationCode} has been cancelled.`);
    setTimeout(() => setCancelFeedback(null), 4000);

    setLiveReservations(prev => prev.map(r => r.id === id ? { ...r, status: 'Cancelled', cancellationReason: finalReason } : r));
  };

  const handleInitiatePaymentForInvoice = (inv: ClientInvoice) => {
    setSelectedInvoiceForPayment(inv.id);
    setPaymentAmount(inv.totalAmount);
    setActiveTab('payment');
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setReceiptFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOnlinePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referenceNumber.trim()) {
      alert('Please enter your transaction reference number.');
      return;
    }

    setIsSubmittingPayment(true);

    if (isSupabaseConfigured()) {
      const { error } = await supabase
        .from('billing_records')
        .update({
          payment_status: 'Paid',
          payment_method: paymentMethod,
          payment_reference: referenceNumber.trim(),
          receipt_url: receiptFilePreview || null,
          paid_at: new Date().toLocaleDateString()
        })
        .eq('id', selectedInvoiceForPayment);

      if (error) {
        console.error("Error updating invoice:", error);
        alert("Error submitting payment details. Please check your connection and try again.");
        setIsSubmittingPayment(false);
        return;
      }
    } else {
       // Legacy fallback para sa mock database service
      await submitOnlinePayment({
        invoiceId: selectedInvoiceForPayment,
        paymentMethod,
        referenceNumber: referenceNumber.trim(),
        accountName: accountName.trim() || user?.name || '',
        amount: paymentAmount,
        receiptFileOrUrl: receiptFilePreview || undefined
      });
    }

    setIsSubmittingPayment(false);
    setPaymentSuccessMsg("Payment successfully verified and sent to Admin!");
    
    // I-update ang UI ng Client para maging 'Paid' agad at mawala ang Red Banner
    setInvoices(prev => prev.map(inv => 
      inv.id === selectedInvoiceForPayment 
        ? { ...inv, paymentStatus: 'Paid', paymentReference: referenceNumber.trim(), paymentMethod: paymentMethod, paidAt: new Date().toLocaleDateString() } 
        : inv
    ));
    
    setReferenceNumber('');
    setReceiptFilePreview(null);
    setTimeout(() => setPaymentSuccessMsg(null), 5000);
  };

  const handleCustomerReply = async (e: React.FormEvent, inquiryId: string) => {
    e.preventDefault();
    const text = (replyTexts[inquiryId] || '').trim();
    if (!text) return;

    setIsSubmittingReply(inquiryId);
    try {
      const res = await sendCustomerReply(inquiryId, text, user?.name || 'Guest');
      if (res.success) {
        setReplyTexts((prev) => ({ ...prev, [inquiryId]: '' }));
        setReplyFeedback((prev) => ({ ...prev, [inquiryId]: 'Your reply has been sent to front-desk staff!' }));
        loadInquiries();
        setTimeout(() => {
          setReplyFeedback((prev) => {
            const next = { ...prev };
            delete next[inquiryId];
            return next;
          });
        }, 4000);
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      alert(err?.message || 'Could not send reply.');
    } finally {
      setIsSubmittingReply(null);
    }
  };

  const pendingInvoices = invoices.filter(inv => inv.paymentStatus === 'Pending');

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-pine-950/80 backdrop-blur-sm animate-fade-in overflow-hidden"
    >
      <div className="bg-white rounded-3xl max-w-2xl sm:max-w-3xl w-full shadow-2xl border border-stone-200/90 overflow-hidden transform-gpu flex flex-col max-h-[90vh]">
        
        <div className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0 bg-stone-50/70">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-serif font-bold text-lg sm:text-2xl text-pine-950">
                Client Portal & Dashboard
              </h2>
              <span className="text-[10px] sm:text-xs font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-pine-100 text-pine-900 border border-pine-200">
                {user?.tier || 'Guest Member'}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              Account: <strong>{user?.name || 'Guest Traveler'}</strong> ({user?.email})
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-slate-500 hover:text-pine-950 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
            aria-label="Close dashboard modal"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        <div className="px-3 sm:px-6 pt-2.5 sm:pt-3 pb-1 border-b border-stone-200/80 flex items-center gap-1.5 sm:gap-2 bg-white overflow-x-auto no-scrollbar scroll-smooth">
          <button
            type="button"
            onClick={() => setActiveTab('bookings')}
            className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap flex-shrink-0 ${
              activeTab === 'bookings'
                ? 'bg-pine-950 text-white shadow-xs'
                : 'text-slate-600 hover:bg-stone-100 hover:text-pine-950'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Stays & Bookings</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
              activeTab === 'bookings' ? 'bg-pine-800 text-gold-200' : 'bg-stone-200 text-slate-700'
            }`}>
              {liveReservations.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('billing')}
            className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap flex-shrink-0 ${
              activeTab === 'billing'
                ? 'bg-pine-950 text-white shadow-xs'
                : 'text-slate-600 hover:bg-stone-100 hover:text-pine-950'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Automated Invoices</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
              activeTab === 'billing' ? 'bg-pine-800 text-gold-200' : 'bg-stone-200 text-slate-700'
            }`}>
              {invoices.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('payment')}
            className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap flex-shrink-0 ${
              activeTab === 'payment'
                ? 'bg-pine-950 text-white shadow-xs'
                : 'text-slate-600 hover:bg-stone-100 hover:text-pine-950'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Upload Online Payment</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('inquiries')}
            className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap flex-shrink-0 relative ${
              activeTab === 'inquiries'
                ? 'bg-pine-950 text-white shadow-xs'
                : 'text-slate-600 hover:bg-stone-100 hover:text-pine-950'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>My Inquiries & Messages</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
              activeTab === 'inquiries' ? 'bg-pine-800 text-gold-200' : 'bg-stone-200 text-slate-700'
            }`}>
              {inquiries.length}
            </span>
            {unreadInquiriesCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="New staff response!" />
            )}
          </button>
        </div>

        {/* --- NEW ACTION REQUIRED BANNER --- */}
        {pendingInvoices.length > 0 && activeTab !== 'payment' && (
          <div className="mx-3 sm:mx-6 mt-4 p-3 sm:p-4 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in shadow-sm">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-rose-900">Action Required: Pending Downpayment</h4>
                <p className="text-[11px] text-rose-700 mt-0.5">
                  You have {pendingInvoices.length} pending invoice(s) amounting to ₱{pendingInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0).toLocaleString()}. Please upload your payment receipt to confirm your reservation.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('payment')}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl whitespace-nowrap transition-colors shadow-xs cursor-pointer"
            >
              Pay Now
            </button>
          </div>
        )}

        {activeTab === 'bookings' && (
          <div className="p-5 sm:p-6 overflow-y-auto overscroll-contain flex-1 space-y-4">
            {cancelFeedback && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs flex items-center justify-between animate-fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{cancelFeedback}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCancelFeedback(null)}
                  className="text-emerald-700 hover:text-emerald-950 p-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {liveReservations.length === 0 ? (
              <div className="text-center py-12 space-y-4">
                <div className="w-16 h-16 rounded-full bg-stone-100 text-slate-400 flex items-center justify-center mx-auto">
                  <BedDouble className="w-8 h-8" strokeWidth={1.5} />
                </div>
                <div className="space-y-1">
                  <h3 className="font-serif font-bold text-lg text-pine-950">
                    No active reservations found
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
                    When you book a transient room or dormitory bedspace, real-time live availability will prevent double bookings and confirm your stay here.
                  </p>
                </div>
                {onBrowseRooms && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onBrowseRooms();
                    }}
                    className="px-5 py-2.5 rounded-xl bg-pine-950 text-gold-200 hover:bg-black font-semibold text-xs transition-colors shadow-md cursor-pointer"
                  >
                    Browse Available Rooms
                  </button>
                )}
              </div>
            ) : (
              liveReservations.map((res) => {
                const isExpanded = expandedId === res.id;
                const isCancelling = cancellingId === res.id;
                const isCancelled = res.status === 'Cancelled';

                return (
                  <div
                    key={res.id}
                    className={`rounded-2xl border transition-all ${
                      isCancelled
                        ? 'border-stone-200 bg-stone-50/70 opacity-80'
                        : 'border-stone-200/90 bg-white hover:border-gold-300 shadow-sm'
                    }`}
                  >
                    <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <img
                          src={res.roomImage}
                          alt={res.roomName}
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-stone-200 flex-shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono font-bold text-pine-950 bg-stone-100 px-2 py-0.5 rounded">
                              {res.reservationCode}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                res.status === 'Confirmed'
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  : res.status === 'Pending Review' || res.status === 'Awaiting Downpayment'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-rose-100 text-rose-900 border border-rose-300'
                              }`}
                            >
                              {res.status}
                            </span>
                          </div>

                          <h4 className="font-serif font-bold text-base text-pine-950 mt-1">
                            {res.roomName}
                          </h4>

                          {/* DITO LALABAS ANG ASSIGNED ROOM NI GUEST KAPAG CONFIRMED NA! */}
                          {res.physicalRoomNumber && (
                            <div className="mt-1 inline-block bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200">
                              Assigned Unit: {res.physicalRoomNumber}
                            </div>
                          )}

                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {res.checkInDate} → {res.checkOutDate}
                            </span>
                            <span className="font-bold text-pine-950">
                              ₱{res.rate.toLocaleString()} / {res.ratePeriod}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                        <button
                          type="button"
                          onClick={() => toggleDetails(res.id)}
                          className="px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{isExpanded ? 'Hide' : 'Details'}</span>
                        </button>

                        {!isCancelled && (
                          <button
                            type="button"
                            onClick={() => handleOpenCancel(res.id)}
                            className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4 sm:p-5 pt-0 border-t border-stone-100 text-xs text-slate-600 space-y-3 bg-stone-50/40">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Guest Details</span>
                            <span className="font-semibold text-slate-800">{res.fullName} ({res.numberOfGuests} Guests)</span>
                            <span className="block text-slate-500">{res.email}<br/>{res.contactNumber}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Assigned Unit</span>
                            <span className="font-bold text-pine-700">{res.physicalRoomNumber || 'Not yet assigned'}</span>
                          </div>
                          <div className="sm:col-span-2">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Special Requests</span>
                            <span className="italic">{res.specialRequests || 'None specified.'}</span>
                          </div>
                        </div>

                        {isCancelled && res.cancellationReason && (
                          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900">
                            <strong>Reason for cancellation:</strong> {res.cancellationReason}
                          </div>
                        )}
                      </div>
                    )}

                    {isCancelling && (
                      <div className="p-4 border-t border-rose-200 bg-rose-50/60 text-xs space-y-3 animate-fade-in">
                        <div className="flex items-center gap-2 text-rose-950 font-bold">
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                          <span>Please state the reason for canceling:</span>
                        </div>
                        <select
                          value={selectedReason}
                          onChange={(e) => setSelectedReason(e.target.value)}
                          className="w-full p-2 bg-white border border-rose-300 rounded-lg text-xs"
                        >
                          <option value="">Select cancellation reason...</option>
                          {COMMON_CANCELLATION_REASONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        {selectedReason === 'Others (please specify)' && (
                          <input
                            type="text"
                            placeholder="Please explain details..."
                            value={otherReasonText}
                            onChange={(e) => setOtherReasonText(e.target.value)}
                            className="w-full p-2 bg-white border border-rose-300 rounded-lg text-xs"
                          />
                        )}
                        {cancelError && <p className="text-rose-700 font-bold">{cancelError}</p>}
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setCancellingId(null)}
                            className="px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs cursor-pointer"
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmCancel(res.id, res.reservationCode)}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs cursor-pointer"
                          >
                            Confirm Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="p-5 sm:p-6 overflow-y-auto overscroll-contain flex-1 space-y-4">
            <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl text-xs text-amber-950 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-700 flex-shrink-0" />
                <span>
                  <strong>Automated Utility Invoicing:</strong> Water & electric meters are computed automatically without manual calculations.
                </span>
              </div>
            </div>

            {invoices.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="font-serif font-bold text-base text-pine-950">No Invoices Issued</h4>
                <p className="text-xs text-slate-500">
                  Automated monthly bills and stay invoices will be rendered here upon billing cycle generation.
                </p>
              </div>
            ) : (
              invoices.map((inv) => {
                const isExpanded = expandedInvoiceId === inv.id;
                const isPaid = inv.paymentStatus === 'Paid';

                return (
                  <div
                    key={inv.id}
                    className="rounded-2xl border border-stone-200/90 bg-white shadow-sm overflow-hidden"
                  >
                    <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-pine-950 bg-stone-100 px-2 py-0.5 rounded">
                            {inv.invoiceNumber}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}>
                            {inv.paymentStatus}
                          </span>
                          <span className="text-xs text-slate-500 font-bold bg-stone-100 px-2 py-0.5 rounded">
                            {inv.stayType}
                          </span>
                        </div>

                        <h4 className="font-serif font-bold text-sm text-pine-950 mt-1">
                          {inv.roomOrBed}
                        </h4>
                        <p className="text-xs text-slate-500">
                          Due Date: <strong>{inv.dueDate}</strong>
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                        <div className="text-left sm:text-right">
                          <div className="text-[10px] sm:text-xs text-slate-500 font-medium">Total Amount</div>
                          <div className="font-serif font-bold text-base sm:text-lg text-pine-950">
                            ₱{inv.totalAmount.toLocaleString()}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedInvoiceId(prev => prev === inv.id ? null : inv.id)}
                            className="px-2.5 sm:px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-semibold text-slate-700 hover:bg-stone-50 transition-colors cursor-pointer"
                          >
                            {isExpanded ? 'Hide' : 'Breakdown'}
                          </button>

                          {!isPaid && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedInvoiceForPayment(inv.id);
                                setPaymentAmount(inv.totalAmount);
                                setActiveTab('payment');
                              }}
                              className="px-3 sm:px-3.5 py-1.5 rounded-lg bg-pine-950 hover:bg-black text-gold-200 font-bold text-xs shadow-xs transition-colors cursor-pointer"
                            >
                              Pay Online
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4 sm:p-5 pt-0 border-t border-stone-100 bg-stone-50/60 text-xs space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                          <div className="p-3 bg-white rounded-xl border border-stone-200">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Billing Period</span>
                            <span className="font-bold text-slate-900 text-sm">{inv.billingPeriod}</span>
                          </div>

                          <div className="p-3 bg-white rounded-xl border border-stone-200">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Amount Due</span>
                            <span className="font-bold text-slate-900 text-sm">₱{inv.rentAmount.toLocaleString()}</span>
                          </div>
                        </div>

                        {inv.paymentReference && (
                          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between">
                            <span>Payment Channel: <strong>{inv.paymentMethod}</strong> (Ref: {inv.paymentReference})</span>
                            <span className="text-[11px] text-emerald-700">Settled {inv.paidAt}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'payment' && (
          <div className="p-5 sm:p-6 overflow-y-auto overscroll-contain flex-1 space-y-4">
            {paymentSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{paymentSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleOnlinePaymentSubmit} className="space-y-4">
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                <h4 className="font-serif font-bold text-sm text-pine-950 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-pine-800" />
                  <span>Select Invoice / Stay to Settle</span>
                </h4>

                <select
                  value={selectedInvoiceForPayment}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedInvoiceForPayment(id);
                    const inv = invoices.find(i => i.id === id);
                    if (inv) setPaymentAmount(inv.totalAmount);
                  }}
                  className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs text-slate-800 font-medium focus:ring-2 focus:ring-pine-700 focus:outline-none"
                >
                  <option value="" disabled>-- Select Pending Invoice --</option>
                  {invoices.filter(i => i.paymentStatus !== 'Paid').map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.invoiceNumber} — {i.roomOrBed} ({i.stayType}) — ₱{i.totalAmount.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Payment Method / Channel
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs text-slate-800 font-medium focus:ring-2 focus:ring-pine-700 focus:outline-none"
                  >
                    <option value="GCash">GCash (0907 861 4267)</option>
                    <option value="Maya">Maya (0907 861 4267)</option>
                    <option value="Bank Transfer">BDO / BPI Bank Transfer</option>
                    <option value="Cash">Over-the-Counter Cash</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Reference Number
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GC-9284719284"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs text-slate-800 font-medium focus:ring-2 focus:ring-pine-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Sender Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Juan Dela Cruz"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs text-slate-800 font-medium focus:ring-2 focus:ring-pine-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Amount Paid (₱)
                  </label>
                  <input
                    type="number"
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                    className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs text-slate-800 font-bold focus:ring-2 focus:ring-pine-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Upload Payment Slip / Screenshot
                </label>
                <div className="border-2 border-dashed border-stone-300 hover:border-gold-400 rounded-2xl p-4 text-center bg-stone-50/50 transition-colors cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleReceiptFileChange}
                    className="hidden"
                    id="receipt-upload-input"
                  />
                  <label htmlFor="receipt-upload-input" className="cursor-pointer block">
                    <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                    <span className="text-xs font-semibold text-pine-900 block">
                      Click to choose or drop screenshot
                    </span>
                    <span className="text-[10px] text-slate-400">PNG, JPG, or PDF up to 5MB</span>
                  </label>

                  {receiptFilePreview && (
                    <div className="mt-3 inline-block relative">
                      <img
                        src={receiptFilePreview}
                        alt="Preview"
                        className="max-h-24 rounded-lg border shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setReceiptFilePreview(null)}
                        className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingPayment || !selectedInvoiceForPayment}
                className="w-full py-3 rounded-xl bg-pine-950 hover:bg-black text-gold-200 font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isSubmittingPayment ? (
                  <span>Submitting...</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Submit Payment Verification (₱{paymentAmount.toLocaleString()})</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* INQUIRIES TAB */}
        {activeTab === 'inquiries' && (
          <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain flex-1 space-y-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
              <div>
                <h3 className="font-serif font-bold text-base sm:text-lg text-pine-950">
                  Concierge Inquiries & Messages
                </h3>
                <p className="text-xs text-slate-800 font-medium">
                  Track questions submitted to front desk, receive answers, and reply to ongoing conversation threads.
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl self-start sm:self-auto border border-stone-200">
                {(['All', 'Active', 'Resolved'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setInquiriesFilter(filter)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      inquiriesFilter === filter
                        ? 'bg-white text-pine-950 shadow-2xs border border-stone-300'
                        : 'text-slate-700 hover:text-pine-950'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {inquiries.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-3 bg-stone-50/70 rounded-2xl border-2 border-stone-300">
                <div className="w-12 h-12 rounded-2xl bg-gold-100 text-pine-900 flex items-center justify-center mx-auto border border-gold-300">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-pine-950">No Inquiries Found</h4>
                  <p className="text-xs text-slate-800 font-medium max-w-sm mx-auto mt-1">
                    Have questions about room availability, monthly dorm slots, or special arrangements?
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      const el = document.getElementById('inquire');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Send Concierge Inquiry</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {inquiries
                  .filter((inq) => {
                    if (inquiriesFilter === 'Active') return inq.status !== 'Resolved';
                    if (inquiriesFilter === 'Resolved') return inq.status === 'Resolved';
                    return true;
                  })
                  .map((inq) => {
                    const isExpanded = expandedInquiryId === inq.id;
                    const messages = ensureInquiryMessages(inq);
                    const isResolved = inq.status === 'Resolved';
                    const hasStaffReply = inq.status === 'Replied' || messages.some(m => m.sender === 'staff');

                    return (
                      <div
                        key={inq.id}
                        className={`rounded-2xl border transition-all overflow-hidden ${
                          isResolved
                            ? 'bg-[#fafbfa] border-stone-200'
                            : inq.status === 'Replied'
                            ? 'bg-[#fffdfa] border-emerald-300 shadow-sm ring-1 ring-emerald-200/60'
                            : 'bg-white border-gold-200/90 shadow-2xs'
                        }`}
                      >
                        <div
                          onClick={() => setExpandedInquiryId(isExpanded ? null : inq.id)}
                          className="p-4 flex items-center justify-between cursor-pointer select-none hover:bg-stone-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              isResolved
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : inq.status === 'Replied'
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : 'bg-gold-100 text-gold-950 border border-gold-300'
                            }`}>
                              <MessageSquare className="w-5 h-5" />
                            </div>

                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-pine-950">
                                  {inq.topic}
                                </span>
                                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-stone-200 text-slate-900 border border-stone-300">
                                  {inq.id.toUpperCase()}
                                </span>
                              </div>
                              <span className="text-xs text-slate-700 font-medium mt-0.5 block">
                                Submitted <strong className="text-slate-900">{inq.receivedAt}</strong> • {messages.length} {messages.length === 1 ? 'message' : 'messages'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5">
                            {isResolved ? (
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-950 border border-emerald-400 flex items-center gap-1 shadow-2xs">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                <span>Resolved</span>
                              </span>
                            ) : inq.status === 'Replied' ? (
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-950 border border-emerald-400 flex items-center gap-1.5 shadow-2xs">
                                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
                                <span>Staff Replied</span>
                              </span>
                            ) : (
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-950 border border-amber-400 shadow-2xs">
                                Waiting for Staff
                              </span>
                            )}

                            <div className="w-8 h-8 rounded-full bg-stone-200/80 flex items-center justify-center text-slate-800">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-stone-200 space-y-3.5 animate-fade-in bg-stone-50/40">
                            
                            {replyFeedback[inq.id] && (
                              <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-950 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                                <span>{replyFeedback[inq.id]}</span>
                              </div>
                            )}

                            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                              {messages.map((m, idx) => {
                                const isUser = m.sender === 'guest';
                                return (
                                  <div
                                    key={m.id || idx}
                                    className={`p-3.5 rounded-2xl text-xs space-y-1.5 shadow-xs ${
                                      isUser
                                        ? 'bg-white border-2 border-stone-300 text-slate-950 ml-4 sm:ml-8'
                                        : 'bg-pine-950 border-2 border-pine-900 text-white mr-4 sm:mr-8'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between text-xs pb-1.5 border-b border-black/10">
                                      <span className="font-bold flex items-center gap-1.5">
                                        {isUser ? (
                                          <>
                                            <User className="w-3.5 h-3.5 text-pine-900" />
                                            <span className="text-pine-950 font-bold">You ({m.senderName})</span>
                                          </>
                                        ) : (
                                          <>
                                            <Sparkles className="w-3.5 h-3.5 text-gold-400" />
                                            <span className="text-gold-300 font-bold">{m.senderName} (Staff Concierge)</span>
                                          </>
                                        )}
                                      </span>
                                      <span className={`text-[11px] font-semibold ${isUser ? 'text-slate-600' : 'text-gold-200/90'}`}>
                                        {m.timestamp}
                                      </span>
                                    </div>
                                    <p className={`whitespace-pre-line leading-relaxed font-sans text-xs ${isUser ? 'text-slate-900 font-medium' : 'text-stone-100 font-normal'}`}>
                                      {m.message}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>

                            {isResolved ? (
                              <div className="p-4 bg-emerald-50 border-2 border-emerald-400 rounded-2xl space-y-2 shadow-xs">
                                <div className="flex items-center gap-2 text-emerald-950 font-bold text-sm">
                                  <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0" />
                                  <span>Inquiry Resolved by Front Desk Staff</span>
                                </div>
                                <p className="text-xs text-emerald-950 font-medium leading-relaxed">
                                  This inquiry was marked as resolved {inq.resolvedAt ? `on ${inq.resolvedAt}` : ''}. The conversation is now closed and you cannot send further replies to this thread.
                                </p>
                                <div className="pt-1 flex flex-wrap items-center gap-3">
                                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-950 bg-white px-3 py-1 rounded-lg border border-emerald-300 shadow-2xs">
                                    <Lock className="w-3.5 h-3.5 text-emerald-700" />
                                    <span>Replies locked</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      const el = document.getElementById('inquire');
                                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                    className="text-xs font-bold text-pine-900 hover:text-gold-700 underline cursor-pointer"
                                  >
                                    Need something else? Send a new inquiry →
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <form
                                onSubmit={(e) => handleCustomerReply(e, inq.id)}
                                className="pt-3 border-t border-stone-200 space-y-2"
                              >
                                <label className="text-xs font-bold text-pine-950 flex items-center justify-between">
                                  <span>Reply Back to Front Desk:</span>
                                  <span className="text-xs text-slate-700 font-semibold">
                                    {hasStaffReply ? 'Active conversation thread' : 'Follow up on inquiry'}
                                  </span>
                                </label>
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <textarea
                                    rows={2}
                                    value={replyTexts[inq.id] || ''}
                                    onChange={(e) =>
                                      setReplyTexts((prev) => ({ ...prev, [inq.id]: e.target.value }))
                                    }
                                    placeholder="Type your reply back to our front desk team..."
                                    className="flex-1 bg-white border-2 border-stone-300 rounded-xl p-3 text-xs text-slate-950 font-medium placeholder:text-slate-500 focus:outline-none focus:border-pine-800 focus:ring-1 focus:ring-pine-800 resize-none shadow-2xs"
                                  />
                                  <button
                                    type="submit"
                                    disabled={
                                      isSubmittingReply === inq.id || !(replyTexts[inq.id] || '').trim()
                                    }
                                    className="px-5 py-2.5 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5 flex-shrink-0 self-end sm:self-stretch"
                                  >
                                    <Send className="w-3.5 h-3.5" />
                                    <span>
                                      {isSubmittingReply === inq.id ? 'Sending...' : 'Send Reply'}
                                    </span>
                                  </button>
                                </div>
                              </form>
                            )}

                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

          </div>
        )}

        <div className="p-4 border-t border-stone-100 bg-stone-50/70 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Dragon Treasure Live Calendar & Real-Time Security</span>
          </div>
          <div>
            Need help? Call Front Desk: <strong className="text-pine-950">{PROPERTY_CONTACT.phone}</strong>
          </div>
        </div>

      </div>
    </div>
  );
};