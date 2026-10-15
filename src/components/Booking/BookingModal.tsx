import React, { useState, useEffect } from 'react';
import { X, CalendarCheck, Users, Mail, Phone, User, Calendar, BedDouble, Sparkles, ShieldCheck, Check, Clock, AlertCircle } from 'lucide-react';
import { SAMPLE_ROOMS } from '../../data/mockData';
import { BookingFormData } from '../../types';
import { UserReservation } from '../../types/auth';
import { useAuth } from '../../context/AuthContext';
import { checkRoomAvailability, createReservationRequest } from '../../services/db/reservationService';
import { supabase } from '../../lib/supabase'; // Idinagdag natin ito para makausap ang rooms at billing
import { RoomDropdown } from '../UI/RoomDropdown';
import { GuestDropdown } from '../UI/GuestDropdown';
import { DatePickerInput } from '../UI/DatePickerInput';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preSelectedRoomType?: string;
  preCheckIn?: string;
  preCheckOut?: string;
  preGuests?: number;
  onSubmitSuccess: (data: BookingFormData) => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  preSelectedRoomType,
  preCheckIn,
  preCheckOut,
  preGuests,
  onSubmitSuccess
}) => {
  const { user, addReservation } = useAuth();

  const [formData, setFormData] = useState<BookingFormData>({
    roomType: SAMPLE_ROOMS[0].name,
    checkInDate: '',
    checkOutDate: '',
    numberOfGuests: 2,
    fullName: '',
    contactNumber: '',
    email: '',
    specialRequests: ''
  });

  const [errors, setErrors] = useState<Partial<Record<keyof BookingFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const initialRoomName = preSelectedRoomType || SAMPLE_ROOMS[0].name;
      const initialRoomObj = SAMPLE_ROOMS.find(r => r.name === initialRoomName) || SAMPLE_ROOMS[0];
      const initialGuests = preGuests
        ? Math.min(preGuests, initialRoomObj.capacity)
        : Math.min(2, initialRoomObj.capacity);

      setFormData({
        roomType: initialRoomName,
        checkInDate: preCheckIn || '',
        checkOutDate: preCheckOut || '',
        numberOfGuests: initialGuests,
        fullName: user?.name || '',
        contactNumber: user?.phone || '',
        email: user?.email || '',
        specialRequests: ''
      });
      setErrors({});
      setIsSubmitting(false);

      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, preSelectedRoomType, preCheckIn, preCheckOut, preGuests, user]);

  if (!isOpen) return null;

  const currentRoom = SAMPLE_ROOMS.find(r => r.name === formData.roomType) || SAMPLE_ROOMS[0];

  const handleRoomChange = (roomName: string) => {
    const targetRoom = SAMPLE_ROOMS.find(r => r.name === roomName) || SAMPLE_ROOMS[0];
    setFormData(prev => ({
      ...prev,
      roomType: roomName,
      numberOfGuests: prev.numberOfGuests > targetRoom.capacity ? targetRoom.capacity : prev.numberOfGuests
    }));
    setErrors(prev => {
      const copy = { ...prev };
      delete copy.roomType;
      delete copy.numberOfGuests;
      return copy;
    });
  };

  const validate = () => {
    const newErrors: Partial<Record<keyof BookingFormData, string>> = {};

    if (!formData.roomType) newErrors.roomType = 'Please select a room type';
    if (!formData.checkInDate) newErrors.checkInDate = 'Check-in date is required';
    if (!formData.checkOutDate) {
      newErrors.checkOutDate = 'Check-out date is required';
    } else if (formData.checkInDate && formData.checkOutDate <= formData.checkInDate) {
      newErrors.checkOutDate = 'Check-out date must be after check-in date';
    }

    if (!formData.numberOfGuests || formData.numberOfGuests < 1) {
      newErrors.numberOfGuests = 'Please select at least 1 guest';
    } else if (formData.numberOfGuests > currentRoom.capacity) {
      newErrors.numberOfGuests = `${currentRoom.name} accommodates up to ${currentRoom.capacity} guests.`;
    }

    if (!formData.fullName.trim()) newErrors.fullName = 'Full guest name is required';
    if (!formData.contactNumber.trim()) newErrors.contactNumber = 'Contact phone number is required';
    if (!formData.email.trim() || !formData.email.includes('@')) newErrors.email = 'Valid email address is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const selectedRoomObj = SAMPLE_ROOMS.find((r) => r.name === formData.roomType) || SAMPLE_ROOMS[0];
      const availability = await checkRoomAvailability({
        roomId: selectedRoomObj.id || formData.roomType.toLowerCase().replace(/\s+/g, '-'),
        checkInDate: formData.checkInDate,
        checkOutDate: formData.checkOutDate
      });

      if (!availability.isAvailable) {
        setIsSubmitting(false);
        setErrors((prev) => ({
          ...prev,
          checkInDate: availability.message
        }));
        return;
      }

      // Compute Total Price based on nights
      const checkIn = new Date(formData.checkInDate);
      const checkOut = new Date(formData.checkOutDate);
      let nights = 1;
      if (!isNaN(checkIn.getTime()) && !isNaN(checkOut.getTime())) {
        const diffTime = checkOut.getTime() - checkIn.getTime();
        nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      }
      const computedTotal = (selectedRoomObj.rate || 0) * nights;

      // UPDATE NG AVAILABLE ROOMS (Babawasan sa Inventory)
      // Kunin muna ang isang available na unit ng kwartong ito
      const { data: availableUnits } = await supabase
        .from('room_units')
        .select('*')
        .eq('room_type', formData.roomType)
        .eq('status', 'Available')
        .limit(1);

      if (availableUnits && availableUnits.length > 0) {
        // I-update ito para maging "Reserved"
        await supabase
          .from('room_units')
          .update({ status: 'Reserved' })
          .eq('id', availableUnits[0].id);
      }

      // Create Reservation Payload
      const newReservation: any = { 
        id: `res-${Date.now()}`,
        reservationCode: `DT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        roomName: formData.roomType,
        roomCategory: selectedRoomObj.category,
        roomImage: selectedRoomObj.image,
        rate: selectedRoomObj.rate,
        ratePeriod: selectedRoomObj.ratePeriod,
        totalAmount: computedTotal, 
        checkInDate: formData.checkInDate,
        checkOutDate: formData.checkOutDate,
        numberOfGuests: formData.numberOfGuests,
        fullName: formData.fullName,
        email: formData.email,
        contactNumber: formData.contactNumber,
        specialRequests: formData.specialRequests,
        status: 'Pending Review',
        bookedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      };

      // AUTOMATIC BILLING: Gagawa ng SOA sa billing_records
      const invoicePayload = {
        invoice_number: `INV-2026-${Math.floor(100 + Math.random() * 900)}`,
        tenant_or_guest: formData.fullName.trim(),
        room_or_bed: formData.roomType,
        type: 'Transient Stay',
        billing_period: `${formData.checkInDate} to ${formData.checkOutDate}`,
        rent_amount: computedTotal,
        water_amount: 0,
        electricity_amount: 0,
        deposit_amount: 0,
        total_amount: computedTotal,
        payment_status: 'Pending',
        due_date: formData.checkInDate // Due on check-in date
      };

      // I-save sabay sa database
      await createReservationRequest(newReservation);
      await supabase.from('billing_records').insert([invoicePayload]); // Awtomatikong billing record
      
      addReservation(newReservation);
      setIsSubmitting(false);
      onSubmitSuccess(formData);
    } catch (err: any) {
      console.error(err);
      setIsSubmitting(false);
      setErrors((prev) => ({
        ...prev,
        fullName: 'An error occurred while creating your reservation. Please try again.'
      }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-pine-950/70 backdrop-blur-sm animate-fade-in overflow-hidden">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] sm:max-h-[90vh] shadow-2xl border border-stone-200/90 flex flex-col overflow-hidden transform-gpu">
        
        <div className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3.5">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden border-2 border-gold-500 shadow-glow-gold flex-shrink-0 bg-pine-950">
              <img
                src="/dragon-treasure-logo.jpg"
                alt="Dragon Treasure Logo"
                className="w-full h-full object-cover scale-[1.10]"
              />
            </div>
            <div>
              <h2 className="font-serif font-bold text-lg sm:text-xl text-pine-950 leading-tight">
                Reservation Request
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                Dragon Treasure Transient & Condotel • Baguio City
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r from-pine-50 via-cream-100 to-pine-50 border-b border-pine-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 text-xs text-pine-950 font-semibold flex-shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <BedDouble className="w-3.5 h-3.5 text-pine-700 flex-shrink-0" strokeWidth={2} />
            <span className="truncate max-w-[200px] sm:max-w-none">Selected: {currentRoom.name}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-gold-300/80 text-gold-900 shadow-2xs whitespace-nowrap">
              {currentRoom.capacityLabel}
            </span>
          </div>
          <span className="text-pine-800 font-bold font-serif whitespace-nowrap">{currentRoom.formattedRate}</span>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 sm:space-y-4 overscroll-contain flex flex-col justify-between">
          <div className="space-y-4">
          
          <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-2xl flex items-center gap-2.5 text-xs text-amber-950 font-medium">
            <Clock className="w-4 h-4 text-amber-700 flex-shrink-0" />
            <span>
              <strong>Workflow Note:</strong> Reservations are submitted as <strong>Pending Review</strong> until staff verifies availability and confirms your stay.
            </span>
          </div>

          <div className="space-y-1">
            <RoomDropdown
              rooms={SAMPLE_ROOMS}
              selectedRoomName={formData.roomType}
              onSelectRoom={handleRoomChange}
              label="Room Choice *"
            />
            {errors.roomType && (
              <p className="text-xs text-red-500 font-medium">{errors.roomType}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DatePickerInput
              label="Check-in Date"
              value={formData.checkInDate}
              required
              error={errors.checkInDate}
              onChange={(date) => {
                const updated: Partial<BookingFormData> = { checkInDate: date };
                if (!formData.checkOutDate || formData.checkOutDate <= date) {
                  const next = new Date(date);
                  next.setDate(next.getDate() + 1);
                  updated.checkOutDate = next.toISOString().split('T')[0];
                }
                setFormData({ ...formData, ...updated });
                setErrors(prev => ({ ...prev, checkInDate: undefined, checkOutDate: undefined }));
              }}
              placeholder="Select check-in"
            />
            <DatePickerInput
              label="Check-out Date"
              value={formData.checkOutDate}
              required
              error={errors.checkOutDate}
              onChange={(date) => {
                setFormData({ ...formData, checkOutDate: date });
                setErrors(prev => ({ ...prev, checkOutDate: undefined }));
              }}
              minDate={formData.checkInDate || new Date().toISOString().split('T')[0]}
              placeholder="Select check-out"
            />
          </div>

          <div className="space-y-1">
            <GuestDropdown
              value={formData.numberOfGuests}
              onChange={(val) => {
                setFormData({ ...formData, numberOfGuests: val });
                setErrors(prev => ({ ...prev, numberOfGuests: undefined }));
              }}
              maxGuests={currentRoom.capacity}
              roomCapacityLabel={currentRoom.capacityLabel}
              error={errors.numberOfGuests}
              required
              label="Number of Guests"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-pine-950 flex items-center gap-1.5 uppercase tracking-wider">
              <User className="w-3.5 h-3.5 text-pine-700" strokeWidth={2} />
              <span>Full Name <span className="text-red-500">*</span></span>
            </label>
            <input
              type="text"
              placeholder="e.g. Juan Dela Cruz"
              value={formData.fullName}
              onChange={(e) => {
                setFormData({ ...formData, fullName: e.target.value });
                if (errors.fullName) setErrors(prev => ({ ...prev, fullName: undefined }));
              }}
              className={`w-full text-xs sm:text-sm bg-stone-50 border rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:ring-2 font-medium transition-all ${
                errors.fullName ? 'border-red-400 focus:ring-red-400/20' : 'border-stone-200 focus:ring-pine-700'
              }`}
            />
            {errors.fullName && (
              <p className="text-xs text-red-500 font-medium">{errors.fullName}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-pine-950 flex items-center gap-1.5 uppercase tracking-wider">
                <Phone className="w-3.5 h-3.5 text-pine-700" strokeWidth={2} />
                <span>Contact Number <span className="text-red-500">*</span></span>
              </label>
              <input
                type="tel"
                placeholder="0907 861 4267"
                value={formData.contactNumber}
                onChange={(e) => {
                  setFormData({ ...formData, contactNumber: e.target.value });
                  if (errors.contactNumber) setErrors(prev => ({ ...prev, contactNumber: undefined }));
                }}
                className={`w-full text-xs sm:text-sm bg-stone-50 border rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:ring-2 font-medium transition-all ${
                  errors.contactNumber ? 'border-red-400 focus:ring-red-400/20' : 'border-stone-200 focus:ring-pine-700'
                }`}
              />
              {errors.contactNumber && (
                <p className="text-xs text-red-500 font-medium">{errors.contactNumber}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-pine-950 flex items-center gap-1.5 uppercase tracking-wider">
                <Mail className="w-3.5 h-3.5 text-pine-700" strokeWidth={2} />
                <span>Email Address <span className="text-red-500">*</span></span>
              </label>
              <input
                type="email"
                placeholder="guest@example.com"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  if (errors.email) setErrors(prev => ({ ...prev, email: undefined }));
                }}
                className={`w-full text-xs sm:text-sm bg-stone-50 border rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:ring-2 font-medium transition-all ${
                  errors.email ? 'border-red-400 focus:ring-red-400/20' : 'border-stone-200 focus:ring-pine-700'
                }`}
              />
              {errors.email && (
                <p className="text-xs text-red-500 font-medium">{errors.email}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-pine-950 flex items-center gap-1.5 uppercase tracking-wider">
              <span>Special Requests or Notes (Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Parking space reservation, estimated arrival time..."
              value={formData.specialRequests}
              onChange={(e) => setFormData({ ...formData, specialRequests: e.target.value })}
              className="w-full text-xs sm:text-sm bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-pine-700 resize-none font-medium transition-all"
            />
          </div>
          </div>

          <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="shimmer-btn px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-pine-900 via-pine-800 to-pine-900 hover:from-pine-800 hover:to-pine-950 active:scale-95 shadow-md hover:shadow-glow-pine transition-all duration-200 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CalendarCheck className="w-4 h-4 text-gold-400" strokeWidth={2} />
              <span>{isSubmitting ? 'Submitting Request...' : 'Submit Reservation Request'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};