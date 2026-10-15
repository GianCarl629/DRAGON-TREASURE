import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  Edit3,
  Plus,
  Trash2,
  User,
  Phone,
  Mail,
  Calendar,
  BedDouble,
  CreditCard,
  AlertTriangle,
  X,
  Check,
  ArrowRight,
  Receipt,
  DoorOpen,
  Image as ImageIcon
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { SAMPLE_ROOMS } from '../../data/mockData';

interface AdminReservation {
  id: string;
  reservationCode: string;
  guestName: string;
  email: string;
  phone: string;
  roomName: string;
  roomType: string;
  category: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  rate: number;
  ratePeriod: string;
  totalAmount: number;
  status: 'Pending Review' | 'Awaiting Downpayment' | 'Confirmed' | 'Completed' | 'Cancelled';
  paymentStatus: 'Paid' | 'Pending' | 'Partial' | 'Unpaid';
  specialRequests?: string;
  cancellationReason?: string;
  bookedAt?: string;
  physicalRoomNumber?: string;
  hasUploadedReceipt?: boolean;
}

interface ReservationsViewProps {
  initialFilter?: string;
}

export const ReservationsView: React.FC<ReservationsViewProps> = ({
  initialFilter
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending Review' | 'Awaiting Downpayment' | 'Confirmed' | 'Cancelled' | 'Completed'>(
    (initialFilter as any) || 'All'
  );
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'transient' | 'dormitory'>('All');

  const [liveReservations, setLiveReservations] = useState<AdminReservation[]>([]);
  const [availablePhysicalRooms, setAvailablePhysicalRooms] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPhysicalRooms = async () => {
    try {
      const { data } = await supabase
        .from('room_units')
        .select('id, room_number, room_type, status')
        .eq('status', 'Available');
      
      if (data) setAvailablePhysicalRooms(data);
    } catch {
      // silent fallback
    }
  };

  const fetchReservations = async () => {
    setIsLoading(true);
    try {
      if (!isSupabaseConfigured()) {
        setLiveReservations([]);
        setIsLoading(false);
        return;
      }

      const { data: resData, error: resError } = await supabase
        .from('reservations')
        .select('*')
        .order('created_at', { ascending: false });
        
      const { data: billingData } = await supabase
        .from('billing_records')
        .select('*');

      if (resError || !resData || resData.length === 0) {
        setLiveReservations([]);
      } else {
        const formattedData: AdminReservation[] = resData.map((res: any) => {
          const rawType = String(res.room_type || res.room_id || '');
          const cleanRoomType = rawType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          const expectedPeriod = `${res.check_in_date || res.check_in || ''} to ${res.check_out_date || res.check_out || ''}`.trim();

          // 3-WAY MATCHING LOGIC (Name + Period + Downpayment Type)
          const hasUploadedReceipt = billingData?.some((b: any) => {
            const matchName = b.tenant_or_guest?.toLowerCase().trim() === String(res.guest_name || '').toLowerCase().trim();
            const matchPeriod = b.billing_period?.trim() === expectedPeriod;
            const isDownpaymentInvoice = b.type === 'Downpayment';
            const hasPaymentData = (b.payment_status === 'Paid' || b.payment_reference || b.receipt_url);
            
            return matchName && matchPeriod && isDownpaymentInvoice && hasPaymentData;
          }) || false;

          return {
            id: res.id,
            reservationCode: res.reservation_code || 'N/A',
            guestName: res.guest_name || 'No Name',
            email: res.guest_email || '',
            phone: res.guest_phone || '',
            roomName: cleanRoomType,
            roomType: cleanRoomType,
            category: res.stay_type || 'transient',
            checkIn: res.check_in_date || res.check_in || '',
            checkOut: res.check_out_date || res.check_out || '',
            guests: Number(res.number_of_guests) || 1,
            rate: Number(res.rate_applied) || 0,
            ratePeriod: 'night',
            totalAmount: Number(res.total_price) || 0,
            status: (res.status as any) || 'Pending Review',
            paymentStatus: (res.payment_status as any) || 'Pending',
            specialRequests: res.special_requests || '',
            cancellationReason: res.cancellation_reason || '',
            physicalRoomNumber: res.physical_room_number || '',
            hasUploadedReceipt
          };
        });
        setLiveReservations(formattedData);
      }
    } catch (err) {
      setLiveReservations([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReservations();
    fetchPhysicalRooms();

    const channel = supabase
      .channel('admin-reservations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        fetchReservations();
        fetchPhysicalRooms();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_records' }, () => {
        fetchReservations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (initialFilter) {
      setStatusFilter(initialFilter as any);
    }
  }, [initialFilter]);

  // ==========================================
  // APPROVE FOR DOWNPAYMENT
  // ==========================================
  const handleApproveForDownpayment = async (res: AdminReservation) => {
    setLiveReservations(prev => prev.map(r => r.id === res.id ? { ...r, status: 'Awaiting Downpayment' } : r));

    const targetPeriod = `${res.checkIn} to ${res.checkOut}`;
    
    // --- BURAHIN ANG 100% INVOICE ---
    try {
      await supabase
        .from('billing_records')
        .delete()
        .ilike('tenant_or_guest', res.guestName.trim())
        .eq('billing_period', targetPeriod)
        .eq('type', 'Transient Stay');
    } catch (e) {
        console.error(e);
    }

    // Check if DP invoice already exists
    const { data: existingInvoices } = await supabase
      .from('billing_records')
      .select('id')
      .ilike('tenant_or_guest', res.guestName.trim())
      .eq('billing_period', targetPeriod)
      .eq('type', 'Downpayment');

    if (!existingInvoices || existingInvoices.length === 0) {
      const dpAmount = res.totalAmount / 2; // 50% DP

      const invoicePayload = {
        invoice_number: `DP-${Math.floor(1000 + Math.random() * 9000)}`,
        tenant_or_guest: res.guestName.trim(),
        room_or_bed: res.roomName,
        type: 'Downpayment',
        billing_period: targetPeriod,
        rent_amount: dpAmount,
        water_amount: 0,
        electricity_amount: 0,
        deposit_amount: 0,
        total_amount: dpAmount,
        payment_status: 'Pending',
        due_date: res.checkIn 
      };
      
      await supabase.from('billing_records').insert([invoicePayload]);
    }

    await supabase.from('reservations').update({ status: 'Awaiting Downpayment' }).eq('id', res.id);
  };

  const [confirmingRes, setConfirmingRes] = useState<AdminReservation | null>(null);
  const [selectedPhysicalRoom, setSelectedPhysicalRoom] = useState<string>('');
  const [guestProofOfPayment, setGuestProofOfPayment] = useState<any>(null);
  
  const handleOpenConfirm = async (res: AdminReservation) => {
    setConfirmingRes(res);
    setSelectedPhysicalRoom('');
    setGuestProofOfPayment(null);

    if (isSupabaseConfigured()) {
      const targetPeriod = `${res.checkIn} to ${res.checkOut}`;
      
      // Pull only the DOWNPAYMENT invoice
      const { data } = await supabase
        .from('billing_records')
        .select('*')
        .ilike('tenant_or_guest', res.guestName.trim())
        .eq('billing_period', targetPeriod)
        .eq('type', 'Downpayment')
        .order('created_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setGuestProofOfPayment(data[0]);
      }
    }
  };

  // ==========================================
  // CONFIRM DP & ASSIGN ROOM -> BALANCE INVOICE
  // ==========================================
  const handleConfirmPaymentAndRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmingRes) return;
    if (!selectedPhysicalRoom) {
      alert("Please select a physical room to assign to this guest.");
      return;
    }

    // Optimistic UI Update
    setLiveReservations(prev => prev.map(r => 
      r.id === confirmingRes.id 
        ? { ...r, status: 'Confirmed', paymentStatus: 'Partial', physicalRoomNumber: selectedPhysicalRoom } 
        : r
    ));
    
    const cachedRes = confirmingRes;
    setConfirmingRes(null);

    try {
      // 1. Deduct the room
      const selectedUnit = availablePhysicalRooms.find(r => r.room_number === selectedPhysicalRoom);
      if (selectedUnit) {
        await supabase.from('room_units').update({ status: 'Reserved' }).eq('id', selectedUnit.id);
      }

      // 2. Update reservation
      const { error: updateError } = await supabase.from('reservations').update({ 
        status: 'Confirmed',
        payment_status: 'Partial',
        physical_room_number: selectedPhysicalRoom
      }).eq('id', cachedRes.id);

      if (updateError) {
        alert("ERROR: Could not save the room assignment. Please ensure the physical_room_number column exists.");
        console.error(updateError);
        fetchReservations(); // Revert screen UI
        return;
      }

      // 3. Mark DP as Paid
      if (guestProofOfPayment) {
        await supabase.from('billing_records').update({ payment_status: 'Paid' }).eq('id', guestProofOfPayment.id);
      }

      // 4. Create Balance Invoice
      const targetPeriod = `${cachedRes.checkIn} to ${cachedRes.checkOut}`;
      const balanceAmount = cachedRes.totalAmount / 2;
      
      const { data: existingBalance } = await supabase
        .from('billing_records')
        .select('id')
        .ilike('tenant_or_guest', cachedRes.guestName.trim())
        .eq('billing_period', targetPeriod)
        .eq('type', 'Balance Payment');

      if (!existingBalance || existingBalance.length === 0) {
        const balancePayload = {
          invoice_number: `BAL-${Math.floor(1000 + Math.random() * 9000)}`,
          tenant_or_guest: cachedRes.guestName.trim(),
          room_or_bed: `Unit ${selectedPhysicalRoom} (${cachedRes.roomName})`,
          type: 'Balance Payment',
          billing_period: targetPeriod,
          rent_amount: balanceAmount,
          water_amount: 0,
          electricity_amount: 0,
          deposit_amount: 0,
          total_amount: balanceAmount,
          payment_status: 'Pending',
          due_date: cachedRes.checkOut // Due on checkout
        };
        await supabase.from('billing_records').insert([balancePayload]);
      }

    } catch (error) {
      console.error(error);
    }
  };

  const handleUpdatePayment = async (id: string, paymentStatus: string) => {
    setLiveReservations(prev => prev.map(r => r.id === id ? { ...r, paymentStatus: paymentStatus as any } : r));
    await supabase.from('reservations').update({ payment_status: paymentStatus }).eq('id', id);
  };

  const handleLiveCancel = async (id: string, reason: string) => {
    const targetRes = liveReservations.find(r => r.id === id);
    setLiveReservations(prev => prev.map(r => r.id === id ? { ...r, status: 'Cancelled' } : r));
    
    await supabase.from('reservations').update({ status: 'Cancelled', cancellation_reason: reason }).eq('id', id);

    if (targetRes?.physicalRoomNumber) {
      await supabase.from('room_units').update({ status: 'Available' }).eq('room_number', targetRes.physicalRoomNumber);
      fetchPhysicalRooms();
    }
  };

  const handleLiveDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to permanently delete this reservation? This action cannot be undone.")) {
      const targetRes = liveReservations.find(r => r.id === id);
      setLiveReservations(prev => prev.filter(r => r.id !== id));
      
      await supabase.from('reservations').delete().eq('id', id);

      if (targetRes?.physicalRoomNumber) {
        await supabase.from('room_units').update({ status: 'Available' }).eq('room_number', targetRes.physicalRoomNumber);
        fetchPhysicalRooms();
      }
    }
  };

  const [selectedReservation, setSelectedReservation] = useState<AdminReservation | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [cancellingRes, setCancellingRes] = useState<AdminReservation | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editFormData, setEditFormData] = useState<Partial<AdminReservation>>({});

  const [newFormData, setNewFormData] = useState({
    guestName: '',
    email: '',
    phone: '',
    roomName: SAMPLE_ROOMS[0].name,
    roomType: SAMPLE_ROOMS[0].name,
    category: SAMPLE_ROOMS[0].category as 'transient' | 'dormitory',
    checkIn: '',
    checkOut: '',
    guests: SAMPLE_ROOMS[0].capacity,
    rate: SAMPLE_ROOMS[0].rate,
    ratePeriod: SAMPLE_ROOMS[0].ratePeriod,
    status: 'Confirmed' as 'Pending Review' | 'Awaiting Downpayment' | 'Confirmed',
    paymentStatus: 'Paid' as 'Paid' | 'Pending' | 'Unpaid',
    specialRequests: ''
  });

  const handleRoomSelect = (name: string) => {
    const selected = SAMPLE_ROOMS.find((r) => r.name === name) || SAMPLE_ROOMS[0];
    setNewFormData((prev) => ({
      ...prev,
      roomName: selected.name,
      roomType: selected.name,
      category: selected.category,
      rate: selected.rate,
      ratePeriod: selected.ratePeriod,
      guests: Math.min(prev.guests, selected.capacity)
    }));
  };

  const filteredReservations = liveReservations.filter((r) => {
    const matchesSearch =
      r.reservationCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.guestName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.roomName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.phone.includes(searchQuery);

    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    const matchesCategory = categoryFilter === 'All' || r.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const handleOpenView = (res: AdminReservation) => {
    setSelectedReservation(res);
    setIsViewModalOpen(true);
  };

  const handleOpenEdit = (res: AdminReservation) => {
    setSelectedReservation(res);
    setEditFormData({ ...res });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedReservation && editFormData) {
      setLiveReservations(prev => prev.map(r => r.id === selectedReservation.id ? { ...r, ...editFormData } as any : r));
      setIsEditModalOpen(false);

      if (editFormData.physicalRoomNumber && editFormData.physicalRoomNumber !== selectedReservation.physicalRoomNumber) {
        if (selectedReservation.physicalRoomNumber) {
          await supabase.from('room_units').update({ status: 'Available' }).eq('room_number', selectedReservation.physicalRoomNumber);
        }
        await supabase.from('room_units').update({ status: 'Reserved' }).eq('room_number', editFormData.physicalRoomNumber);
        fetchPhysicalRooms();
      }

      await supabase.from('reservations').update({
        guest_name: editFormData.guestName,
        guest_phone: editFormData.phone,
        check_in_date: editFormData.checkIn,
        check_out_date: editFormData.checkOut,
        status: editFormData.status,
        payment_status: editFormData.paymentStatus,
        physical_room_number: editFormData.physicalRoomNumber
      }).eq('id', selectedReservation.id);
      
      setSelectedReservation(null);
    }
  };

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    const checkInDate = new Date(newFormData.checkIn);
    const checkOutDate = new Date(newFormData.checkOut);
    let diffDays = 1;
    
    if (!isNaN(checkInDate.getTime()) && !isNaN(checkOutDate.getTime())) {
      const diffTime = checkOutDate.getTime() - checkInDate.getTime();
      diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }
    
    const computedTotal = newFormData.category === 'transient'
      ? (Number(newFormData.rate) || 1500) * diffDays
      : Number(newFormData.rate) || 8000;

    const payload = {
      reservation_code: `DT-${Math.floor(100 + Math.random() * 900)}`,
      guest_name: newFormData.guestName || 'Walk-in Guest',
      guest_email: newFormData.email || 'guest@example.com',
      guest_phone: newFormData.phone || '0917-000-0000',
      room_type: newFormData.roomType.toLowerCase().replace(/ /g, '-'),
      stay_type: newFormData.category,
      check_in_date: newFormData.checkIn || new Date().toISOString().split('T')[0],
      check_out_date: newFormData.checkOut || new Date().toISOString().split('T')[0],
      number_of_guests: Number(newFormData.guests) || 2,
      rate_applied: Number(newFormData.rate) || 1500,
      total_price: computedTotal,
      status: newFormData.status,
      payment_status: newFormData.paymentStatus,
      special_requests: newFormData.specialRequests
    };

    await supabase.from('reservations').insert([payload]);
    setIsAddModalOpen(false);
    fetchReservations();
  };

  const handlePromptCancel = (res: AdminReservation) => {
    setCancellingRes(res);
    setCancelReason('Cancelled per guest request / room scheduling adjustment');
  };

  const handleConfirmCancelSubmit = () => {
    if (cancellingRes) {
      handleLiveCancel(cancellingRes.id, cancelReason || 'Cancelled by staff administrator');
      setCancellingRes(null);
      setCancelReason('');
    }
  };

  return (
    <div className="space-y-6">

      {/* --- HEADER --- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif font-bold text-2xl text-pine-950 flex items-center gap-2">
            <span>Reservation Management</span>
            <span className="text-xs font-sans font-bold px-2.5 py-0.5 rounded-full bg-gold-100 text-pine-900 border border-gold-300">
              {liveReservations.length} Bookings
            </span>
          </h2>
          <p className="text-xs text-slate-600">
            Review incoming transient guest requests, confirm bookings, and assign physical rooms.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Reservation</span>
        </button>
      </div>

      {/* --- FILTERS --- */}
      <div className="p-4 rounded-3xl bg-[#fffdfa] border border-gold-200/90 shadow-card space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">

          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4 text-pine-700" />
            </div>
            <input
              type="text"
              placeholder="Search by reservation code, guest name, room, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pine-700 transition-all font-medium"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {(['All', 'Pending Review', 'Awaiting Downpayment', 'Confirmed', 'Cancelled'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === tab
                    ? 'bg-gradient-to-r from-gold-500 to-gold-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-pine-900 hover:bg-gold-50'
                  }`}
              >
                {tab}
                {(tab === 'Pending Review' || tab === 'Awaiting Downpayment') && (
                  <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    statusFilter === tab ? 'bg-pine-950 text-gold-300' : 'bg-amber-100 text-amber-900'
                  }`}>
                    {liveReservations.filter(r => r.status === tab).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
            className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-pine-700 cursor-pointer"
          >
            <option value="All">All Categories</option>
            <option value="transient">Transient Stays</option>
            <option value="dormitory">Dormitory Slots</option>
          </select>

        </div>
      </div>

      <div className="bg-[#fffdfa] border border-gold-200/90 rounded-3xl overflow-hidden shadow-card">
        
        {/* --- MOBILE VIEW --- */}
        <div className="block md:hidden divide-y divide-gold-200/60">
          {filteredReservations.length === 0 ? (
            <div className="py-12 px-4 text-center text-slate-400 text-xs font-medium">
              No reservations found. Database is empty.
            </div>
          ) : (
            filteredReservations.map((res) => (
              <div key={res.id} className="p-4 space-y-3 hover:bg-gold-50/30 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-xs text-pine-900 bg-gold-100/80 px-2.5 py-1 rounded-lg border border-gold-300">
                    {res.reservationCode}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {res.status === 'Pending Review' ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-amber-700" />
                        <span>Pending Review</span>
                      </span>
                    ) : res.status === 'Awaiting Downpayment' ? (
                      <>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300 inline-flex items-center gap-1">
                          <Receipt className="w-2.5 h-2.5 text-blue-700" />
                          <span>Awaiting DP</span>
                        </span>
                        {res.hasUploadedReceipt && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1 animate-pulse shadow-sm">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Receipt Ready
                          </span>
                        )}
                      </>
                    ) : res.status === 'Confirmed' ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        <span>Confirmed</span>
                      </span>
                    ) : res.status === 'Cancelled' ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                        <XCircle className="w-2.5 h-2.5 text-rose-500" />
                        <span>Cancelled</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-800 border border-stone-200">
                        {res.status}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">{res.guestName}</span>
                    <span className="font-serif font-bold text-base text-pine-900">
                      ₱{res.totalAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 font-medium mt-0.5">
                    {res.roomName} • {res.guests} Guests
                  </div>
                  {res.physicalRoomNumber && (
                    <div className="mt-1 inline-block bg-pine-100 text-pine-900 text-[10px] font-bold px-2 py-0.5 rounded border border-pine-200">
                      Assigned Room: {res.physicalRoomNumber}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-1">
                    <a href={`tel:${res.phone}`} className="text-pine-800 font-semibold hover:underline flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      <span>{res.phone}</span>
                    </a>
                    <span>•</span>
                    <span className="truncate">{res.email}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Check-in</span>
                    <span className="font-semibold text-slate-800">{res.checkIn}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gold-600 flex-shrink-0" />
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Check-out</span>
                    <span className="font-semibold text-slate-800">{res.checkOut}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Pay:</span>
                    <select
                      value={res.paymentStatus}
                      onChange={(e) => handleUpdatePayment(res.id, e.target.value as any)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none bg-stone-50 ${
                        res.paymentStatus === 'Paid'
                          ? 'text-emerald-800 border-emerald-300 bg-emerald-50/70'
                          : res.paymentStatus === 'Pending' || res.paymentStatus === 'Partial'
                            ? 'text-amber-800 border-amber-300 bg-amber-50/70'
                            : 'text-rose-800 border-rose-300 bg-rose-50/70'
                      }`}
                    >
                      <option value="Paid">Paid</option>
                      <option value="Pending">Pending</option>
                      <option value="Partial">Partial</option>
                      <option value="Unpaid">Unpaid</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {res.status === 'Pending Review' && (
                      <button
                        type="button"
                        onClick={() => handleApproveForDownpayment(res)}
                        className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Approve for DP</span>
                      </button>
                    )}

                    {res.status === 'Awaiting Downpayment' && (
                      res.hasUploadedReceipt ? (
                        <button
                          type="button"
                          onClick={() => handleOpenConfirm(res)}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1 ring-2 ring-emerald-300"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Check DP</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="px-2.5 py-1.5 bg-slate-100 text-slate-400 rounded-lg text-xs font-bold border border-slate-200 flex items-center gap-1 cursor-not-allowed"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Waiting for DP...</span>
                        </button>
                      )
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenView(res)}
                      className="p-1.5 rounded-lg bg-stone-100 hover:bg-gold-100 text-slate-700 hover:text-pine-950 transition-colors cursor-pointer border border-stone-200"
                    >
                      <Eye className="w-4 h-4 text-pine-700" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(res)}
                      className="p-1.5 rounded-lg bg-stone-100 hover:bg-gold-100 text-slate-700 hover:text-pine-950 transition-colors cursor-pointer border border-stone-200"
                    >
                      <Edit3 className="w-4 h-4 text-pine-700" />
                    </button>

                    {res.status !== 'Cancelled' ? (
                      <button
                        type="button"
                        onClick={() => handlePromptCancel(res)}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors cursor-pointer border border-rose-200"
                      >
                        <XCircle className="w-4 h-4 text-rose-600" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleLiveDelete(res.id)}
                        className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer border border-stone-200"
                      >
                        <Trash2 className="w-4 h-4 text-slate-400" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* --- DESKTOP VIEW --- */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-pine-950 border-b border-gold-200/80 bg-gold-50/60">
              <tr>
                <th className="py-3.5 px-4 font-bold">Reservation ID</th>
                <th className="py-3.5 px-4 font-bold">Guest</th>
                <th className="py-3.5 px-4 font-bold">Room Category & Unit</th>
                <th className="py-3.5 px-4 font-bold">Check-in / Out</th>
                <th className="py-3.5 px-4 font-bold">Status</th>
                <th className="py-3.5 px-4 font-bold">Payment</th>
                <th className="py-3.5 px-4 font-bold text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold-100/70">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-semibold">
                    <div className="flex justify-center items-center gap-2">
                       <div className="w-4 h-4 border-2 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
                       Loading reservations...
                    </div>
                  </td>
                </tr>
              ) : filteredReservations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs font-medium">
                    No reservations found. Database is empty.
                  </td>
                </tr>
              ) : (
                filteredReservations.map((res) => (
                  <tr key={res.id} className="hover:bg-gold-50/40 transition-colors">

                    <td className="py-3.5 px-4 font-mono font-bold text-pine-900 whitespace-nowrap">
                      {res.reservationCode}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{res.guestName}</div>
                      <div className="text-[11px] text-slate-500">{res.phone}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900">{res.roomName}</div>
                      <div className="text-[10px] text-slate-500">{res.guests} Guests • ₱{res.rate.toLocaleString()}/{res.ratePeriod}</div>
                      {res.physicalRoomNumber && (
                        <div className="mt-1 inline-block bg-pine-100 text-pine-900 text-[10px] font-bold px-2 py-0.5 rounded border border-pine-200">
                          Unit: {res.physicalRoomNumber}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="text-slate-700 font-bold">{res.checkIn}</div>
                      <div className="text-slate-500 text-[10px]">to {res.checkOut}</div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {res.status === 'Pending Review' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 text-amber-700" />
                          <span>Pending Review</span>
                        </span>
                      ) : res.status === 'Awaiting Downpayment' ? (
                        <div className="flex flex-col gap-1.5 items-start">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300 inline-flex items-center gap-1">
                            <Receipt className="w-2.5 h-2.5 text-blue-700" />
                            <span>Awaiting DP</span>
                          </span>
                          {res.hasUploadedReceipt && (
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1 shadow-xs">
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                              Receipt Ready
                            </span>
                          )}
                        </div>
                      ) : res.status === 'Confirmed' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>Confirmed</span>
                        </span>
                      ) : res.status === 'Cancelled' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                          <XCircle className="w-2.5 h-2.5 text-rose-500" />
                          <span>Cancelled</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-800 border border-stone-200">
                          {res.status}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <select
                        value={res.paymentStatus}
                        onChange={(e) => handleUpdatePayment(res.id, e.target.value)}
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border cursor-pointer focus:outline-none bg-stone-50 ${
                          res.paymentStatus === 'Paid'
                            ? 'text-emerald-800 border-emerald-300 bg-emerald-50/70'
                            : res.paymentStatus === 'Pending' || res.paymentStatus === 'Partial'
                              ? 'text-amber-800 border-amber-300 bg-amber-50/70'
                              : 'text-rose-800 border-rose-300 bg-rose-50/70'
                        }`}
                      >
                        <option value="Paid">Paid</option>
                        <option value="Pending">Pending</option>
                        <option value="Partial">Partial</option>
                        <option value="Unpaid">Unpaid</option>
                      </select>
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">

                        {res.status === 'Pending Review' && (
                          <button
                            type="button"
                            onClick={() => handleApproveForDownpayment(res)}
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1"
                            title="Approve for DP & Generate Billing"
                          >
                            <CreditCard className="w-3 h-3" />
                            <span>Approve for DP</span>
                          </button>
                        )}

                        {res.status === 'Awaiting Downpayment' && (
                          res.hasUploadedReceipt ? (
                            <button
                              type="button"
                              onClick={() => handleOpenConfirm(res)}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1 ring-2 ring-emerald-300 ring-offset-1"
                              title="Verify Payment & Assign Room"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Check DP</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="px-2.5 py-1.5 bg-slate-100 text-slate-400 rounded-lg text-xs font-bold border border-slate-200 flex items-center gap-1 cursor-not-allowed"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span>Waiting for DP...</span>
                            </button>
                          )
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenView(res)}
                          className="p-1.5 rounded-lg bg-stone-100 hover:bg-gold-100 text-slate-700 hover:text-pine-950 transition-colors cursor-pointer border border-stone-200"
                          title="View Full Details"
                        >
                          <Eye className="w-3.5 h-3.5 text-pine-700" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEdit(res)}
                          className="p-1.5 rounded-lg bg-stone-100 hover:bg-gold-100 text-slate-700 hover:text-pine-950 transition-colors cursor-pointer border border-stone-200"
                          title="Edit & Assign Room"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-pine-700" />
                        </button>

                        {res.status !== 'Cancelled' ? (
                          <button
                            type="button"
                            onClick={() => handlePromptCancel(res)}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors cursor-pointer border border-rose-200"
                            title="Cancel Reservation"
                          >
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleLiveDelete(res.id)}
                            className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer border border-stone-200"
                            title="Remove Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- MGA MODALS --- */}

      {/* 1. Confirm DP & Assign Room Modal */}
      {confirmingRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-pine-950/70 backdrop-blur-sm animate-fade-in">
          <form onSubmit={handleConfirmPaymentAndRoom} className="bg-white border border-stone-200 rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-pine-900 border-b border-stone-200 pb-3">
              <DoorOpen className="w-5 h-5 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-sm">Verify Payment & Assign Room</h3>
                <p className="text-xs text-slate-500">Confirm downpayment for {confirmingRes.guestName}</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              
              {/* PROOF OF PAYMENT SECTION */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Client Proof of Payment
                </span>
                
                {guestProofOfPayment && (guestProofOfPayment.payment_reference || guestProofOfPayment.receipt_url) ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-slate-800">
                      <span className="font-medium">Channel:</span>
                      <span className="font-bold">{guestProofOfPayment.payment_method || 'Online Payment'}</span>
                    </div>
                    {guestProofOfPayment.payment_reference && (
                      <div className="flex justify-between items-center text-slate-800">
                        <span className="font-medium">Reference No:</span>
                        <span className="font-bold text-pine-700 bg-pine-50 px-2 py-0.5 rounded border border-pine-200">
                          {guestProofOfPayment.payment_reference}
                        </span>
                      </div>
                    )}
                    
                    {guestProofOfPayment.receipt_url && (
                      <div className="mt-4 p-2 bg-white rounded-xl border border-stone-200">
                        <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider block mb-2">
                          Receipt Screenshot:
                        </span>
                        <img 
                          src={guestProofOfPayment.receipt_url} 
                          alt="Proof of Payment" 
                          className="w-full max-h-60 object-contain rounded shadow-sm bg-stone-50"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span className="font-medium">No payment details uploaded by the guest yet.</span>
                  </div>
                )}
              </div>

              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex justify-between items-center">
                <span className="text-slate-500 font-semibold">Requested Room Type:</span>
                <span className="font-bold text-pine-950">{confirmingRes.roomName}</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-800 font-bold block">Select Available Physical Unit</label>
                <select
                  required
                  value={selectedPhysicalRoom}
                  onChange={(e) => setSelectedPhysicalRoom(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-xl p-3 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-pine-700"
                >
                  <option value="">-- Choose an available unit --</option>
                  {availablePhysicalRooms
                    .filter(room => {
                      const dbRoomType = confirmingRes.roomType.toLowerCase().replace(/ /g, '-');
                      const unitType = room.room_type.toLowerCase().replace(/ /g, '-');
                      return dbRoomType === unitType;
                    })
                    .map(room => (
                      <option key={room.id} value={room.room_number}>
                        Unit {room.room_number} ({room.room_type})
                      </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500">This will automatically deduct the room from inventory and mark payment as Partial.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setConfirmingRes(null)}
                className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Confirm DP & Assign
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. View Modal */}
      {isViewModalOpen && selectedReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-pine-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-stone-200 rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-pine-900 bg-gold-100 px-2.5 py-1 rounded border border-gold-300">
                  {selectedReservation.reservationCode}
                </span>
                <span className="text-xs uppercase font-bold text-pine-950">
                  Reservation Details
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsViewModalOpen(false)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Guest Information
                </span>
                <div className="flex items-center gap-2 text-slate-900">
                  <User className="w-3.5 h-3.5 text-pine-700" />
                  <span className="font-bold text-sm">{selectedReservation.guestName}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <Mail className="w-3.5 h-3.5 text-pine-700" />
                  <span>{selectedReservation.email}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <Phone className="w-3.5 h-3.5 text-pine-700" />
                  <span>{selectedReservation.phone}</span>
                </div>
              </div>

              <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Stay Specifications
                </span>
                <div className="flex justify-between text-slate-800">
                  <span className="text-slate-500">Room Type:</span>
                  <span className="font-bold">{selectedReservation.roomName}</span>
                </div>
                <div className="flex justify-between text-slate-800">
                  <span className="text-slate-500">Assigned Unit:</span>
                  <span className="font-bold text-pine-700">{selectedReservation.physicalRoomNumber || 'Not yet assigned'}</span>
                </div>
                <div className="flex justify-between text-slate-800">
                  <span className="text-slate-500">Check-in:</span>
                  <span className="font-semibold">{selectedReservation.checkIn}</span>
                </div>
                <div className="flex justify-between text-slate-800">
                  <span className="text-slate-500">Check-out:</span>
                  <span className="font-semibold">{selectedReservation.checkOut}</span>
                </div>
                <div className="flex justify-between text-slate-800">
                  <span className="text-slate-500">Party Size:</span>
                  <span>{selectedReservation.guests} Guests</span>
                </div>
                <div className="flex justify-between text-slate-900 pt-1 border-t border-stone-200">
                  <span className="text-slate-500">Rate / Total:</span>
                  <span className="font-bold font-serif text-pine-900">
                    ₱{selectedReservation.rate.toLocaleString()} /{selectedReservation.ratePeriod} (Total: ₱{selectedReservation.totalAmount.toLocaleString()})
                  </span>
                </div>
              </div>

              {selectedReservation.specialRequests && (
                <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200 space-y-1">
                  <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
                    Special Requests
                  </span>
                  <p className="text-slate-800 italic">"{selectedReservation.specialRequests}"</p>
                </div>
              )}

              {selectedReservation.cancellationReason && (
                <div className="bg-rose-50 p-3.5 rounded-2xl border border-rose-200 space-y-1">
                  <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">
                    Cancellation Reason
                  </span>
                  <p className="text-rose-900 italic">"{selectedReservation.cancellationReason}"</p>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-stone-200">
              {selectedReservation.status === 'Pending Review' && (
                <button
                  type="button"
                  onClick={() => {
                    handleApproveForDownpayment(selectedReservation);
                    setIsViewModalOpen(false);
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Approve for DP
                </button>
              )}
              {selectedReservation.status === 'Awaiting Downpayment' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsViewModalOpen(false);
                    handleOpenConfirm(selectedReservation);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Confirm DP & Assign
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsViewModalOpen(false)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Cancel Prompt Modal */}
      {cancellingRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-pine-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-stone-200 rounded-3xl max-w-md w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3 text-rose-700">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-600" />
              <div>
                <h3 className="font-bold text-sm text-slate-900">Cancel Reservation</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Are you sure you want to cancel booking <strong>{cancellingRes.reservationCode}</strong> for <strong>{cancellingRes.guestName}</strong>?
                </p>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="text-slate-800 font-semibold block">
                Cancellation Reason / Internal Note
              </label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter cancellation reason..."
                className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setCancellingRes(null)}
                className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Keep Active
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelSubmit}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Edit Modal */}
      {isEditModalOpen && selectedReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-pine-950/70 backdrop-blur-sm animate-fade-in">
          <form onSubmit={handleSaveEdit} className="bg-white border border-stone-200 rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="font-bold text-sm text-slate-900">
                Edit Reservation: {selectedReservation.reservationCode}
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-700 block font-semibold">Guest Name</label>
                <input
                  type="text"
                  value={editFormData.guestName || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, guestName: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-slate-900 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-700 block font-semibold">Phone</label>
                <input
                  type="text"
                  value={editFormData.phone || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-slate-900 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-700 block font-semibold">Check-in Date</label>
                <input
                  type="date"
                  value={editFormData.checkIn || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, checkIn: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-slate-900 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-700 block font-semibold">Check-out Date</label>
                <input
                  type="date"
                  value={editFormData.checkOut || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, checkOut: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-slate-900 text-xs"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-slate-700 block font-semibold">Assign Physical Room</label>
                <select
                  value={editFormData.physicalRoomNumber || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, physicalRoomNumber: e.target.value })}
                  className="w-full bg-pine-50 border border-pine-200 rounded-xl px-3 py-2 text-pine-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-pine-700"
                >
                  <option value="">-- Select an Available Room --</option>
                  {availablePhysicalRooms
                    .filter(room => {
                      const dbRoomType = selectedReservation.roomType.toLowerCase().replace(/ /g, '-');
                      const unitType = room.room_type.toLowerCase().replace(/ /g, '-');
                      return dbRoomType === unitType;
                    })
                    .map(room => (
                      <option key={room.id} value={room.room_number}>
                        {room.room_number} ({room.room_type})
                      </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-700 block font-semibold">Status</label>
                <select
                  value={editFormData.status || 'Confirmed'}
                  onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as any })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-slate-900 text-xs"
                >
                  <option value="Pending Review">Pending Review</option>
                  <option value="Awaiting Downpayment">Awaiting Downpayment</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-700 block font-semibold">Payment Status</label>
                <select
                  value={editFormData.paymentStatus || 'Paid'}
                  onChange={(e) => setEditFormData({ ...editFormData, paymentStatus: e.target.value as any })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-slate-900 text-xs"
                >
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Partial">Partial</option>
                  <option value="Unpaid">Unpaid</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-gradient-to-r from-gold-500 to-gold-600 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. Add New Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-pine-950/70 backdrop-blur-sm animate-fade-in">
          <form onSubmit={handleCreateNew} className="bg-white border border-stone-200 rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="font-bold text-sm text-slate-900 font-serif">
                Create Walk-in / Direct Reservation
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-700 block font-semibold">Guest Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={newFormData.guestName}
                  onChange={(e) => setNewFormData({ ...newFormData, guestName: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-slate-900 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-700 block font-semibold">Phone Number *</label>
                <input
                  type="text"
                  required
                  placeholder="0917-000-0000"
                  value={newFormData.phone}
                  onChange={(e) => setNewFormData({ ...newFormData, phone: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-slate-900 text-xs"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-slate-700 block font-semibold">Room Option</label>
                <select
                  value={newFormData.roomName}
                  onChange={(e) => handleRoomSelect(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-slate-900 text-xs font-medium"
                >
                  {SAMPLE_ROOMS.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name} — {r.formattedRate} (Capacity: {r.capacityLabel})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-700 block font-semibold">Check-in Date *</label>
                <input
                  type="date"
                  required
                  value={newFormData.checkIn}
                  onChange={(e) => setNewFormData({ ...newFormData, checkIn: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-slate-900 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-700 block font-semibold">Check-out Date *</label>
                <input
                  type="date"
                  required
                  value={newFormData.checkOut}
                  onChange={(e) => setNewFormData({ ...newFormData, checkOut: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-slate-900 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-700 block font-semibold">Status</label>
                <select
                  value={newFormData.status}
                  onChange={(e) => setNewFormData({ ...newFormData, status: e.target.value as any })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-slate-900 text-xs"
                >
                  <option value="Confirmed">Confirmed</option>
                  <option value="Pending Review">Pending Review</option>
                  <option value="Awaiting Downpayment">Awaiting Downpayment</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-700 block font-semibold">Payment Status</label>
                <select
                  value={newFormData.paymentStatus}
                  onChange={(e) => setNewFormData({ ...newFormData, paymentStatus: e.target.value as any })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-slate-900 text-xs"
                >
                  <option value="Paid">Paid</option>
                  <option value="Partial">Partial</option>
                  <option value="Pending">Pending</option>
                  <option value="Unpaid">Unpaid</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-gradient-to-r from-gold-500 to-gold-600 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Create Reservation
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};