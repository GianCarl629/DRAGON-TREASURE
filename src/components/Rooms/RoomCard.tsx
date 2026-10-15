import React, { useState, useEffect } from 'react';
import { Users, Check, Eye, CalendarCheck, Star } from 'lucide-react';
import { Room } from '../../types';
import { supabase } from '../../lib/supabase'; // Idinagdag para sa live count

interface RoomCardProps {
  room: Room;
  onSelect: (room: Room) => void;
  onBook: (room: Room) => void;
}

export const RoomCard: React.FC<RoomCardProps> = ({ room, onSelect, onBook }) => {
  const isDorm = room.category === 'dormitory';
  
  // State para sa live na bilang ng available rooms
  const [availableCount, setAvailableCount] = useState<number | string>('...'); 

 useEffect (() => {
    const fetchLiveAvailability = async () => {
      try {
        const { count, error } = await supabase
          .from('room_units')
          .select('*', { count: 'exact', head: true })
          .eq('room_type', room.name)
          .eq('status', 'Available');

        if (!error && count !== null) {
          setAvailableCount(count);
        } else {
          // Fallback sa default kung may error o wala pang data
          setAvailableCount(room.sampleQuantity);
        }
      } catch (err) {
        setAvailableCount(room.sampleQuantity);
      }
    };

    fetchLiveAvailability();
  }, [room.name, room.sampleQuantity]);

  return (
    <div className="group relative bg-white/95 backdrop-blur-sm rounded-3xl overflow-hidden border border-stone-200/90 shadow-card hover:shadow-luxury-hover hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between">
      
      {/* Top Image Container */}
      <div className="relative h-56 sm:h-60 overflow-hidden bg-stone-900">
        <img
          src={room.image}
          alt={room.name}
          className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700 ease-out"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-pine-950/75 via-black/15 to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />

        {/* Top Badges */}
        <div className="absolute top-3.5 left-3.5 flex flex-col gap-1.5 z-10">
          <span
            className={`text-[11px] font-bold tracking-wider uppercase px-3 py-1 rounded-full shadow-md flex items-center gap-1.5 ${
              isDorm
                ? 'bg-amber-600 text-white border border-amber-500'
                : 'bg-white text-pine-950 border border-stone-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isDorm ? 'bg-amber-200' : 'bg-emerald-600'}`} />
            <span>{isDorm ? 'Monthly Rental' : 'Short-Term Lodging'}</span>
          </span>

          {room.popular && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase px-2.5 py-0.5 rounded-full bg-gradient-to-r from-gold-600 to-gold-500 text-white shadow-xs w-fit">
              <Star className="w-3 h-3 fill-white text-white" strokeWidth={1} />
              <span>Most Popular</span>
            </span>
          )}
        </div>

        {/* Quantity Indicator with Live Pulse Dot */}
        <div className="absolute top-3.5 right-3.5 bg-white/95 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-medium text-slate-700 border border-stone-200/80 shadow-xs flex items-center gap-1.5 z-10">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Available: <strong className="text-pine-950 font-bold">{availableCount}</strong></span>
        </div>

        {/* Capacity overlay */}
        <div className="absolute bottom-3 left-3.5 flex items-center gap-1.5 text-white text-xs font-semibold bg-black/50 backdrop-blur-md px-3 py-1 rounded-xl border border-white/10">
          <Users className="w-3.5 h-3.5 text-gold-300" strokeWidth={2} />
          <span>Capacity: {room.capacityLabel}</span>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
        <div>
          <h3 className="font-serif font-bold text-lg sm:text-xl text-pine-950 group-hover:text-pine-800 transition-colors">
            {room.name}
          </h3>

          <p className="mt-2 text-xs sm:text-sm text-slate-600 line-clamp-2 leading-relaxed">
            {room.description}
          </p>

          {/* Key Feature Bullets */}
          <div className="mt-3.5 pt-3 border-t border-stone-100 space-y-1.5">
            {room.features.slice(0, 3).map((feat, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                <div className="w-4 h-4 rounded-full bg-pine-50 text-pine-700 flex items-center justify-center flex-shrink-0 border border-pine-200/50">
                  <Check className="w-2.5 h-2.5" strokeWidth={3} />
                </div>
                <span className="truncate font-medium">{feat}</span>
              </div>
            ))}
            <div className="pt-1 text-[11px] text-gold-700 font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gold-500" />
              <span>Includes Shared Lounge, Dining, Kitchenette & CR</span>
            </div>
          </div>
        </div>

        {/* Price & Actions footer */}
        <div className="pt-4 border-t border-stone-100 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">
              {isDorm ? 'Monthly Rental' : 'Nightly Rate'}
            </div>
            <div className="text-xl font-bold text-pine-950 font-serif leading-tight">
              ₱{room.rate.toLocaleString()}
              <span className="text-xs font-normal text-slate-600 ml-1 font-sans">
                / {room.ratePeriod}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onSelect(room)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-slate-700 hover:bg-stone-50 hover:text-pine-950 transition-colors"
              title="View room details"
              aria-label={`View details for ${room.name}`}
            >
              <Eye className="w-3.5 h-3.5 text-pine-700" strokeWidth={2} />
              <span className="hidden sm:inline">Details</span>
            </button>
            <button
              onClick={() => onBook(room)}
              className="shimmer-btn px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-pine-900 to-pine-800 hover:from-pine-800 hover:to-pine-950 active:scale-95 shadow-xs hover:shadow-glow-pine transition-all duration-200 flex items-center gap-1.5"
            >
              <CalendarCheck className="w-3.5 h-3.5 text-gold-400" strokeWidth={2} />
              <span>Book</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};