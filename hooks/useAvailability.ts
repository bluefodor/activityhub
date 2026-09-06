import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sunday, 1=Monday, ..., 6=Saturday
export type TimeBlock = 'morning' | 'afternoon' | 'evening';

export interface AvailabilitySlot {
  day_of_week: DayOfWeek;
  time_block: TimeBlock;
  enabled: boolean;
}

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const TIME_BLOCKS: TimeBlock[] = ['morning', 'afternoon', 'evening'];

export function useAvailability(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAvailability = useCallback(async () => {
    if (!targetUserId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_availability')
        .select('day_of_week, time_block, enabled')
        .eq('user_id', targetUserId)
        .order('day_of_week')
        .order('time_block');

      if (error) {
        console.error('Error fetching availability:', error);
        setAvailability([]);
      } else {
        // If no data exists, initialize with all slots disabled
        if (!data || data.length === 0) {
          const initialSlots: AvailabilitySlot[] = [];
          for (let day = 0; day <= 6; day++) {
            for (const timeBlock of TIME_BLOCKS) {
              initialSlots.push({
                day_of_week: day as DayOfWeek,
                time_block: timeBlock,
                enabled: false,
              });
            }
          }
          setAvailability(initialSlots);
        } else {
          // Merge with all possible slots
          const allSlots: AvailabilitySlot[] = [];
          for (let day = 0; day <= 6; day++) {
            for (const timeBlock of TIME_BLOCKS) {
              const existing = data.find(
                (d) => d.day_of_week === day && d.time_block === timeBlock
              );
              allSlots.push({
                day_of_week: day as DayOfWeek,
                time_block: timeBlock,
                enabled: existing?.enabled || false,
              });
            }
          }
          setAvailability(allSlots);
        }
      }
    } catch (error) {
      console.error('Unexpected error fetching availability:', error);
      setAvailability([]);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  const updateAvailability = async (
    dayOfWeek: DayOfWeek,
    timeBlock: TimeBlock,
    enabled: boolean
  ): Promise<boolean> => {
    if (!user || !targetUserId || targetUserId !== user.id) {
      console.error('Cannot update availability: not authorized');
      return false;
    }

    try {
      // Use upsert to insert or update
      const { error } = await supabase
        .from('user_availability')
        .upsert(
          {
            user_id: user.id,
            day_of_week: dayOfWeek,
            time_block: timeBlock,
            enabled: enabled,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,day_of_week,time_block',
          }
        );

      if (error) {
        console.error('Error updating availability:', error);
        return false;
      }

      // Update local state
      setAvailability((prev) =>
        prev.map((slot) =>
          slot.day_of_week === dayOfWeek && slot.time_block === timeBlock
            ? { ...slot, enabled }
            : slot
        )
      );

      return true;
    } catch (error) {
      console.error('Unexpected error updating availability:', error);
      return false;
    }
  };

  return {
    availability,
    loading,
    updateAvailability,
    refetch: fetchAvailability,
    DAYS_OF_WEEK,
    TIME_BLOCKS,
  };
}

