import React, { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { CaretLeft, CaretRight, Lock, LockOpen } from 'phosphor-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  parseISO,
  addDays,
  getHours,
  getMinutes,
  startOfDay
} from 'date-fns';
import { blockDay, unblockDay, blockHour, unblockHour, setBlockedTimes } from '../store/slices/appointmentsSlice';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

// Generate time slots from 8 AM to 6 PM with 30-minute intervals
const generateTimeSlots = () => {
  const slots = [];
  for (let hour = 8; hour <= 18; hour++) {
    slots.push({ hour, minutes: 0 });
    if (hour !== 18) {
      slots.push({ hour, minutes: 30 });
    }
  }
  return slots;
};

// Format time slot for display
const formatTimeSlot = (slot) => {
  return `${String(slot.hour).padStart(2, '0')}:${String(slot.minutes).padStart(2, '0')}`;
};

const normalizeDateKey = (dateVal) => {
  if (!dateVal) return '';
  if (typeof dateVal === 'string') return dateVal.slice(0, 10);
  return format(dateVal, 'yyyy-MM-dd');
};

export default function Agenda() {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const { blockedTimes } = useSelector((state) => state.appointments);
  const normalizedRole = (user.role || '').toLowerCase();
  const isDoctor = normalizedRole === 'doctor';
  const isPatient = normalizedRole === 'patient';

  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState([]);
  const [occupiedSlots, setOccupiedSlots] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedHour, setSelectedHour] = useState(null);
  const [selectedMinutes, setSelectedMinutes] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [hasActiveAppointment, setHasActiveAppointment] = useState(false);
  const [activeAppointment, setActiveAppointment] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isStacked, setIsStacked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const timeSlots = generateTimeSlots();
  const todayStart = startOfDay(new Date());
  const minPatientDate = startOfDay(addDays(new Date(), 2)); // Minimum date for patients is 2 days from now
  const maxAllowedDate = startOfDay(addMonths(new Date(), 3));

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    defaultValues: {
      phone: '',
      appointmentType: 'consultation',
      note: ''
    }
  });

  // Check if a time slot is blocked
  const isTimeSlotBlocked = (date, timeSlot) => {
    const formattedDate = format(date, 'yyyy-MM-dd');
    return (
      blockedTimes.hours.some(
        block =>
          block.date === formattedDate &&
          block.hour === timeSlot.hour &&
          block.minutes === timeSlot.minutes
      ) || blockedTimes.days.includes(formattedDate)
    );
  };

  // Get appointments (including globally occupied slots) for a specific time slot
  const getAppointmentsForTimeSlot = (date, timeSlot) => {
    const matchedOwn = appointments.filter(appointment => {
      if (!appointment.date) return false;
      const appointmentDate = parseISO(appointment.date);
      return (
        isSameDay(appointmentDate, date) &&
        getHours(appointmentDate) === timeSlot.hour &&
        getMinutes(appointmentDate) === timeSlot.minutes &&
        (appointment.status === 'accepte' || appointment.status === 'en_attente')
      );
    });

    if (matchedOwn.length > 0 || isDoctor) {
      return matchedOwn;
    }

    // For patients, also check other patients' occupied slots without exposing their details
    return occupiedSlots.filter(slot => {
      if (!slot.date) return false;
      const slotDate = parseISO(slot.date);
      return (
        isSameDay(slotDate, date) &&
        getHours(slotDate) === timeSlot.hour &&
        getMinutes(slotDate) === timeSlot.minutes &&
        (slot.status === 'accepte' || slot.status === 'en_attente')
      );
    });
  };

  // Handle blocking/unblocking a time slot (doctor only)
  const handleTimeSlotBlock = async (date, timeSlot) => {
    if (!isDoctor) return;
    try {
      setError(null);
      const formattedDate = format(date, 'yyyy-MM-dd');
      const isSpecificSlotBlocked = blockedTimes.hours.some(
        block =>
          block.date === formattedDate &&
          block.hour === timeSlot.hour &&
          block.minutes === timeSlot.minutes
      );

      if (isSpecificSlotBlocked) {
        const { error: deleteError } = await supabase
          .from('creneaux_bloques')
          .delete()
          .eq('date', formattedDate)
          .eq('heure', timeSlot.hour)
          .eq('minutes', timeSlot.minutes)
          .eq('type_blocage', 'heure');

        if (deleteError) throw deleteError;

        dispatch(
          unblockHour({
            date: formattedDate,
            hour: timeSlot.hour,
            minutes: timeSlot.minutes
          })
        );
      } else if (!blockedTimes.days.includes(formattedDate)) {
        const hasAppointment = getAppointmentsForTimeSlot(date, timeSlot).length > 0;
        if (!hasAppointment) {
          const { error: insertError } = await supabase
            .from('creneaux_bloques')
            .insert([
              {
                date: formattedDate,
                heure: timeSlot.hour,
                minutes: timeSlot.minutes,
                type_blocage: 'heure'
              }
            ]);

          if (insertError) throw insertError;

          dispatch(
            blockHour({
              date: formattedDate,
              hour: timeSlot.hour,
              minutes: timeSlot.minutes
            })
          );
        }
      }
    } catch (err) {
      console.error('Error handling time slot block:', err);
      setError(err.message);
    }
  };

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsStacked(window.innerWidth < 640);
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Generate calendar days for the current month
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Navigate to previous month
  const goToPrevious = () => {
    setCurrentDate(prev => subMonths(prev, 1));
  };

  // Navigate to next month (limit to 3 months in the future)
  const goToNext = () => {
    const nextMonth = addMonths(currentDate, 1);
    if (startOfMonth(nextMonth) <= maxAllowedDate) {
      setCurrentDate(nextMonth);
    }
  };

  // Check if a day is blocked
  const isDayBlocked = (date) => {
    return blockedTimes.days.includes(format(date, 'yyyy-MM-dd'));
  };

  // Handle date selection
  const handleDateClick = (date) => {
    const clickedDay = startOfDay(date);

    if (isDoctor) {
      if (clickedDay >= todayStart && clickedDay <= maxAllowedDate) {
        setSelectedDate(date);
        setShowBlockModal(true);
      }
      return;
    }

    if (isPatient) {
      if (
        clickedDay >= minPatientDate &&
        clickedDay <= maxAllowedDate &&
        !isDayBlocked(date)
      ) {
        setSelectedDate(date);
      }
    }
  };

  // Fetch appointments, occupied slots, and blocked times
  const fetchData = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      setError(null);

      const {
        data: { user: authUser },
        error: authError
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authUser) return;

      const { data: userProfile, error: userProfileError } = await supabase
        .from('profiles')
        .select('role, full_name, avatar_url, avatar')
        .eq('id', authUser.id)
        .maybeSingle();

      if (userProfileError) throw userProfileError;

      const effectiveRole = (userProfile?.role || normalizedRole || 'patient').toLowerCase();

      // Fetch blocked times from creneaux_bloques
      const { data: blockedTimesData, error: blockedTimesError } = await supabase
        .from('creneaux_bloques')
        .select('*');

      if (blockedTimesError) throw blockedTimesError;

      const blockedDays = (blockedTimesData || [])
        .filter(block => block.type_blocage === 'jour')
        .map(block => normalizeDateKey(block.date));

      const blockedHours = (blockedTimesData || [])
        .filter(block => block.type_blocage === 'heure')
        .map(block => ({
          date: normalizeDateKey(block.date),
          hour: block.heure,
          minutes: block.minutes
        }));

      dispatch(setBlockedTimes({ days: blockedDays, hours: blockedHours }));

      // Fetch appointments based on user role
      let appointmentsQuery = supabase
        .from('rendez_vous')
        .select(`
          *,
          patient:profiles!rendez_vous_patient_id_fkey(
            full_name,
            avatar_url,
            avatar
          )
        `);

      if (effectiveRole === 'patient') {
        appointmentsQuery = appointmentsQuery.eq('patient_id', authUser.id);
      }

      const { data: appointmentsData, error: appointmentsError } = await appointmentsQuery;
      if (appointmentsError) throw appointmentsError;

      const transformedAppointments = (appointmentsData || []).map(appointment => ({
        id: appointment.id,
        patientId: appointment.patient_id,
        patientName: appointment.patient_full_name || appointment.patient?.full_name || 'Unknown',
        profilePicture: appointment.patient?.avatar || appointment.patient?.avatar_url || null,
        date: appointment.date_heure,
        type: appointment.type_rendez_vous,
        status: appointment.statut,
        note: appointment.note,
        telephone: appointment.telephone
      }));

      setAppointments(transformedAppointments);

      // For patients, fetch all occupied slot timestamps via secure RPC so double-booking is prevented
      if (effectiveRole === 'patient') {
        const { data: bookedData, error: bookedError } = await supabase.rpc('get_booked_slots');
        if (!bookedError && Array.isArray(bookedData)) {
          setOccupiedSlots(
            bookedData.map(slot => ({
              date: slot.date_heure,
              status: slot.statut
            }))
          );
        } else {
          setOccupiedSlots(transformedAppointments);
        }

        // Check for active appointment for the logged-in patient
        const now = new Date();
        const foundActive = transformedAppointments.find(app => {
          const appointmentDate = parseISO(app.date);
          if (app.status === 'accepte') {
            return appointmentDate > now;
          }
          return app.status === 'en_attente' || app.status === 'refuse';
        });

        if (foundActive) {
          setActiveAppointment(foundActive);
          setHasActiveAppointment(true);
          localStorage.setItem('activeAppointment', JSON.stringify(foundActive));
        } else {
          setActiveAppointment(null);
          setHasActiveAppointment(false);
          localStorage.removeItem('activeAppointment');
        }
      } else {
        setOccupiedSlots(transformedAppointments);
        setActiveAppointment(null);
        setHasActiveAppointment(false);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [dispatch, normalizedRole]);

  // Fetch data on mount / role change and poll every 30 seconds
  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Handle form submission
  const onSubmit = async (data) => {
    try {
      setLoading(true);
      setError(null);

      const {
        data: { user: authUser },
        error: authError
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!authUser) throw new Error('No authenticated user found');

      const { data: userProfile, error: userProfileError } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, avatar')
        .eq('id', authUser.id)
        .maybeSingle();

      if (userProfileError) {
        console.error('Error fetching user profile:', userProfileError);
        throw userProfileError;
      }

      const patientFullName =
        userProfile?.full_name ||
        user.name ||
        authUser.user_metadata?.full_name ||
        authUser.email ||
        'Patient';

      // Use exact selected hour and minutes (no -1 hour offset!)
      const appointmentDate = new Date(selectedDate);
      appointmentDate.setHours(selectedHour, selectedMinutes || 0, 0, 0);

      const { data: appointment, error: appointmentError } = await supabase
        .from('rendez_vous')
        .insert([
          {
            id: uuidv4(),
            patient_id: authUser.id,
            patient_full_name: patientFullName,
            date_heure: format(appointmentDate, "yyyy-MM-dd'T'HH:mm:ss"),
            type_rendez_vous: data.appointmentType,
            statut: 'en_attente',
            note: data.note || '',
            telephone: data.phone
          }
        ])
        .select()
        .single();

      if (appointmentError) {
        console.error('Error creating appointment:', appointmentError);
        if (appointmentError.code === '23505') {
          setError(t('agenda.slotAlreadyBooked'));
          await fetchData(false);
          setShowAppointmentForm(false);
          setSelectedHour(null);
          setSelectedMinutes(null);
          return;
        }
        throw appointmentError;
      }

      const newAppointment = {
        id: appointment.id,
        patientId: authUser.id,
        patientName: patientFullName,
        profilePicture: userProfile?.avatar || userProfile?.avatar_url || null,
        date: appointment.date_heure,
        type: data.appointmentType,
        status: 'en_attente',
        note: data.note,
        telephone: data.phone
      };

      setAppointments(prev => [...prev, newAppointment]);
      setOccupiedSlots(prev => [...prev, { date: appointment.date_heure, status: 'en_attente' }]);
      setActiveAppointment(newAppointment);
      setHasActiveAppointment(true);
      localStorage.setItem('activeAppointment', JSON.stringify(newAppointment));

      setShowAppointmentForm(false);
      setSelectedHour(null);
      setSelectedMinutes(null);
      setSelectedDate(null);
      reset();
    } catch (err) {
      console.error('Error saving appointment:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle appointment modification (for pending or refused appointments)
  const handleChangeAppointment = async () => {
    if (!activeAppointment || activeAppointment.status === 'accepte') return;
    try {
      setLoading(true);
      setError(null);

      const { error: deleteError } = await supabase
        .from('rendez_vous')
        .delete()
        .eq('id', activeAppointment.id);

      if (deleteError) {
        console.error('Error deleting appointment:', deleteError);
        throw deleteError;
      }

      setAppointments(prev => prev.filter(app => app.id !== activeAppointment.id));
      setOccupiedSlots(prev => prev.filter(slot => slot.date !== activeAppointment.date));
      setHasActiveAppointment(false);
      setActiveAppointment(null);
      localStorage.removeItem('activeAppointment');
    } catch (err) {
      console.error('Error changing appointment:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Format time for display
  const formatAppointmentTime = (dateString) => {
    return format(parseISO(dateString), 'HH:mm');
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'accepte':
        return 'bg-green-100 text-green-800';
      case 'en_attente':
        return 'bg-yellow-100 text-yellow-800';
      case 'refuse':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get day name in current language with mobile optimization
  const getDayName = (date, mobile = false) => {
    const dayIndex = date.getDay();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = t(`agenda.days.${days[dayIndex]}`);

    if (mobile && i18n.language?.startsWith('ar')) {
      return dayName.replace('ال', '');
    }
    return dayName;
  };

  // Get month name in current language
  const getMonthName = (date) => {
    const monthIndex = date.getMonth();
    const months = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december'
    ];
    return t(`agenda.months.${months[monthIndex]}`);
  };

  // Get status text in current language
  const getStatusText = (status) => {
    return t(`agenda.status.${status}`);
  };

  // Handle blocking/unblocking a day (doctor only)
  const handleDayBlock = async (date) => {
    if (!isDoctor) return;
    try {
      setError(null);
      const formattedDate = format(date, 'yyyy-MM-dd');
      if (isDayBlocked(date)) {
        const { error: deleteError } = await supabase
          .from('creneaux_bloques')
          .delete()
          .eq('date', formattedDate)
          .eq('type_blocage', 'jour');

        if (deleteError) throw deleteError;

        dispatch(unblockDay(formattedDate));
      } else {
        const { error: insertError } = await supabase
          .from('creneaux_bloques')
          .insert([
            {
              date: formattedDate,
              heure: 0,
              minutes: 0,
              type_blocage: 'jour'
            }
          ]);

        if (insertError) throw insertError;

        dispatch(blockDay(formattedDate));
      }
    } catch (err) {
      console.error('Error handling day block:', err);
      setError(err.message);
    }
  };

  // Handle time slot click (patient)
  const handleTimeSlotClick = (timeSlot) => {
    if (!selectedDate) return;

    const isBlocked = isTimeSlotBlocked(selectedDate, timeSlot);
    const hasAppointment = getAppointmentsForTimeSlot(selectedDate, timeSlot).length > 0;
    const dayBlocked = blockedTimes.days.includes(format(selectedDate, 'yyyy-MM-dd'));

    if (!isBlocked && !hasAppointment && !dayBlocked) {
      setSelectedHour(timeSlot.hour);
      setSelectedMinutes(timeSlot.minutes);

      if (isPatient) {
        setShowAppointmentForm(true);
      }
    }
  };

  // Render the month view
  const renderMonthView = () => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const firstDayIndex = monthStart.getDay();

    return (
      <div className={`grid ${isStacked ? 'grid-cols-1' : 'grid-cols-7'} gap-1 overflow-x-auto`}>
        {/* Day headers */}
        {!isStacked &&
          days.map((day) => {
            const label = t(`agenda.days.${day}`);
            const displayLabel =
              isMobile && i18n.language?.startsWith('ar') ? label.replace('ال', '') : label;
            return (
              <div key={day} className="text-center font-medium text-gray-600 py-2 text-xs sm:text-sm">
                {displayLabel}
              </div>
            );
          })}

        {/* Empty cells to align day 1 with the correct weekday column */}
        {!isStacked &&
          Array.from({ length: firstDayIndex }).map((_, idx) => (
            <div key={`empty-${idx}`} className="min-h-[80px] sm:min-h-[100px] p-1 sm:p-2" />
          ))}

        {/* Calendar days */}
        {calendarDays.map((day, index) => {
          const dayStart = startOfDay(day);
          const isToday = isSameDay(day, new Date());
          const isPast = isDoctor ? dayStart < todayStart : dayStart < minPatientDate;
          const isFuture = dayStart > maxAllowedDate;
          const isBlocked = isDayBlocked(day);
          const isAvailable = !isPast && !isFuture && !isBlocked;

          return (
            <div
              key={index}
              onClick={() => handleDateClick(day)}
              className={`
                min-h-[80px] sm:min-h-[100px] p-1 sm:p-2 border rounded-lg relative
                ${isToday ? 'bg-blue-50 border-blue-200' : 'border-gray-200'}
                ${!isSameMonth(day, currentDate) ? 'opacity-50' : ''}
                ${isPast || isFuture ? 'opacity-50 cursor-not-allowed bg-red-50/30' : 'cursor-pointer'}
                ${isBlocked ? 'bg-red-50' : ''}
                ${isAvailable ? 'bg-green-50 hover:bg-green-100' : 'bg-red-50 hover:bg-red-100'}
                ${isStacked ? 'mb-2' : ''}
              `}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center">
                  <span className={`font-medium text-xs sm:text-sm ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
                    {format(day, 'd')}
                  </span>
                  {isStacked && (
                    <span className="ml-2 text-xs text-gray-500">
                      {getDayName(day, isMobile)}
                    </span>
                  )}
                </div>
                {isDoctor && !isPast && !isFuture && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDayBlock(day);
                    }}
                    className={`p-1.5 rounded-full ${isBlocked ? 'text-red-600 hover:bg-red-100' : 'text-green-600 hover:bg-green-100'}`}
                  >
                    {isBlocked ? <Lock size={18} /> : <LockOpen size={18} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Time slots view for patients
  const renderTimeSlotsView = () => {
    if (!selectedDate) return null;

    const dayBlocked = blockedTimes.days.includes(format(selectedDate, 'yyyy-MM-dd'));

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
        <div className="bg-white rounded-lg shadow-xl w-[95vw] h-[90vh] max-w-6xl flex flex-col">
          <div className="p-4 sm:p-6 border-b">
            <h3 className="text-lg sm:text-xl font-bold">
              {t('agenda.timeSlots.title')} - {format(selectedDate, 'd')} {getMonthName(selectedDate)}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {timeSlots.map((timeSlot, index) => {
                const isBlocked = dayBlocked || isTimeSlotBlocked(selectedDate, timeSlot);
                const slotAppointments = getAppointmentsForTimeSlot(selectedDate, timeSlot);
                const hasSlotAppointment = slotAppointments.length > 0;
                const isAvailable = !isBlocked && !hasSlotAppointment;

                return (
                  <div
                    key={index}
                    onClick={() => handleTimeSlotClick(timeSlot)}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      isAvailable ? 'bg-green-50 cursor-pointer hover:bg-green-100' : 'bg-red-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatTimeSlot(timeSlot)}
                      </span>
                      {isAvailable ? (
                        <span className="text-xs text-green-600">
                          {t('agenda.available')}
                        </span>
                      ) : (
                        <span className="text-xs text-red-600">
                          {hasSlotAppointment ? t('agenda.hasAppointment') : t('agenda.blocked')}
                        </span>
                      )}
                    </div>
                    {isDoctor && !hasSlotAppointment && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTimeSlotBlock(selectedDate, timeSlot);
                        }}
                        className={`p-2 rounded-full ${
                          isBlocked ? 'text-red-600 hover:bg-red-100' : 'text-green-600 hover:bg-green-100'
                        }`}
                      >
                        {isBlocked ? <Lock size={18} /> : <LockOpen size={18} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-4 sm:p-6 border-t flex justify-end">
            <button
              type="button"
              onClick={() => {
                setSelectedDate(null);
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Block Modal for doctors
  const renderBlockModal = () => {
    if (!selectedDate) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
        <div className="bg-white rounded-lg shadow-xl w-[95vw] h-[90vh] max-w-6xl flex flex-col">
          <div className="p-4 sm:p-6 border-b">
            <h3 className="text-lg sm:text-xl font-bold">
              {t('agenda.timeSlots.title')} - {format(selectedDate, 'd')} {getMonthName(selectedDate)}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {timeSlots.map((timeSlot, index) => {
                const isBlocked = isTimeSlotBlocked(selectedDate, timeSlot);
                const slotAppointments = getAppointmentsForTimeSlot(selectedDate, timeSlot);
                const hasAppointment = slotAppointments.length > 0;
                const isAvailable = !isBlocked && !hasAppointment;

                return (
                  <div
                    key={index}
                    onClick={() => {
                      if (hasAppointment) {
                        setSelectedAppointment(slotAppointments[0]);
                        setShowAppointmentModal(true);
                      }
                    }}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      isAvailable ? 'bg-green-50' : 'bg-red-50'
                    } ${hasAppointment ? 'cursor-pointer hover:bg-red-100' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatTimeSlot(timeSlot)}
                      </span>
                      {isAvailable ? (
                        <span className="text-xs text-green-600">
                          {t('agenda.available')}
                        </span>
                      ) : (
                        <span className="text-xs text-red-600">
                          {hasAppointment ? t('agenda.hasAppointment') : t('agenda.blocked')}
                        </span>
                      )}
                    </div>
                    {isDoctor && !hasAppointment && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTimeSlotBlock(selectedDate, timeSlot);
                        }}
                        className={`p-2 rounded-full ${
                          isBlocked ? 'text-red-600 hover:bg-red-100' : 'text-green-600 hover:bg-green-100'
                        }`}
                      >
                        {isBlocked ? <Lock size={18} /> : <LockOpen size={18} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-4 sm:p-6 border-t flex justify-end">
            <button
              type="button"
              onClick={() => {
                setShowBlockModal(false);
                setSelectedDate(null);
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Appointment Form Modal for patients
  const renderAppointmentForm = () => {
    if (!selectedDate || selectedHour === null) return null;

    const formattedSelectedTime = `${String(selectedHour).padStart(2, '0')}:${String(
      selectedMinutes || 0
    ).padStart(2, '0')}`;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-bold mb-4">
            {t('agenda.newAppointment')} - {format(selectedDate, 'd')} {getMonthName(selectedDate)} {formattedSelectedTime}
          </h3>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('agenda.form.phone')}
              </label>
              <input
                type="tel"
                {...register('phone', {
                  required: t('validation.required'),
                  pattern: {
                    value: /^[0-9]{10}$/,
                    message: t('validation.phoneFormat')
                  }
                })}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.phone ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={loading}
              />
              {errors.phone && (
                <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('agenda.form.appointmentType')}
              </label>
              <select
                {...register('appointmentType', {
                  required: t('validation.required')
                })}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.appointmentType ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={loading}
              >
                <option value="consultation">{t('agenda.appointmentTypes.consultation')}</option>
                <option value="follow-up">{t('agenda.appointmentTypes.follow-up')}</option>
                <option value="emergency">{t('agenda.appointmentTypes.emergency')}</option>
                <option value="other">{t('agenda.appointmentTypes.other')}</option>
              </select>
              {errors.appointmentType && (
                <p className="mt-1 text-sm text-red-600">{errors.appointmentType.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('agenda.form.note')}
              </label>
              <textarea
                {...register('note', {
                  maxLength: {
                    value: 500,
                    message: t('validation.maxLength', { length: 500 })
                  }
                })}
                rows={2}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.note ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={loading}
              ></textarea>
              {errors.note && (
                <p className="mt-1 text-sm text-red-600">{errors.note.message}</p>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  reset();
                  setShowAppointmentForm(false);
                  setSelectedHour(null);
                  setSelectedMinutes(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                disabled={loading}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center min-w-[100px] ${
                  loading ? 'opacity-75 cursor-not-allowed' : ''
                }`}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('agenda.form.submitting')}
                  </>
                ) : (
                  t('agenda.form.submit')
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Render appointment management view (patient with active appointment)
  const renderAppointmentManagement = () => {
    if (!hasActiveAppointment || !activeAppointment || !isPatient) return null;
    const parsedDate = parseISO(activeAppointment.date);

    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
          <h2 className="text-2xl font-bold text-center mb-6">{t('agenda.manageAppointment')}</h2>

          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">{t('agenda.appointmentDetails')}</h3>
              <div className="space-y-2">
                <p>
                  <span className="font-medium">{t('agenda.date')}:</span>{' '}
                  {`${getDayName(parsedDate)} ${format(parsedDate, 'd')} ${getMonthName(parsedDate)} ${format(parsedDate, 'yyyy')}`}
                </p>
                <p>
                  <span className="font-medium">{t('agenda.time')}:</span>{' '}
                  {format(parsedDate, 'HH:mm')}
                </p>
                <p>
                  <span className="font-medium">{t('agenda.type')}:</span>{' '}
                  {t(`agenda.appointmentTypes.${activeAppointment.type}`)}
                </p>
                <p>
                  <span className="font-medium">{t('agenda.statusType')}:</span>{' '}
                  <span className={`inline-block px-2 py-1 rounded ${getStatusColor(activeAppointment.status)}`}>
                    {t(`agenda.status.${activeAppointment.status}`)}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col space-y-3">
            {activeAppointment.status === 'en_attente' && (
              <button
                type="button"
                onClick={handleChangeAppointment}
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {t('agenda.modifyAppointment')}
              </button>
            )}
            {activeAppointment.status === 'accepte' && (
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-green-700 font-medium">
                  {t('agenda.appointmentAccepted')}
                </p>
                <p className="text-sm text-green-600 mt-2">
                  {t('agenda.appointmentAcceptedMessage')}
                </p>
              </div>
            )}
            {activeAppointment.status === 'refuse' && (
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-red-700 font-medium">
                  {t('agenda.appointmentDeclined')}
                </p>
                <p className="text-sm text-red-600 mt-2">
                  {t('agenda.appointmentDeclinedMessage')}
                </p>
                <button
                  type="button"
                  onClick={handleChangeAppointment}
                  disabled={loading}
                  className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {t('agenda.requestNewAppointment')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {hasActiveAppointment && isPatient ? (
        renderAppointmentManagement()
      ) : (
        <>
          {/* Header with navigation */}
          <div className="flex flex-col sm:flex-row items-center justify-between p-2 sm:p-4 bg-white border-b">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{t('agenda.title')}</h1>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <button
                type="button"
                onClick={goToPrevious}
                className="p-1 sm:p-2 rounded-full hover:bg-gray-100"
              >
                <CaretLeft size={20} />
              </button>
              <h2 className="text-lg sm:text-xl font-semibold text-center">
                {getMonthName(currentDate)}
              </h2>
              <button
                type="button"
                onClick={goToNext}
                className="p-1 sm:p-2 rounded-full hover:bg-gray-100"
              >
                <CaretRight size={20} />
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-4 mt-3 rounded-md bg-red-50 border border-red-200 p-3 flex items-center justify-between text-sm text-red-700">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-4 text-xs font-medium text-red-800 underline"
              >
                {t('common.close')}
              </button>
            </div>
          )}

          {/* Calendar content */}
          <div className="flex-1 p-2 sm:p-4 overflow-auto">
            {renderMonthView()}
          </div>

          {/* Block Modal for doctors */}
          {showBlockModal && renderBlockModal()}

          {/* Time slots view for patients */}
          {selectedDate && isPatient && !showAppointmentForm && renderTimeSlotsView()}

          {/* Appointment Form Modal for patients */}
          {showAppointmentForm && renderAppointmentForm()}

          {/* Appointment Modal */}
          {showAppointmentModal && selectedAppointment && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-4 sm:p-6">
                <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">{t('agenda.appointmentDetails')}</h3>

                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">{t('agenda.patient')}</p>
                    <p className="font-medium text-sm sm:text-base">{selectedAppointment.patientName}</p>
                  </div>

                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">{t('agenda.date')}</p>
                    <p className="font-medium text-sm sm:text-base">
                      {`${getDayName(parseISO(selectedAppointment.date))} ${format(parseISO(selectedAppointment.date), 'd')} ${getMonthName(parseISO(selectedAppointment.date))} ${format(parseISO(selectedAppointment.date), 'yyyy')}`}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">{t('agenda.time')}</p>
                    <p className="font-medium text-sm sm:text-base">{formatAppointmentTime(selectedAppointment.date)}</p>
                  </div>

                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">{t('agenda.type')}</p>
                    <p className="font-medium text-sm sm:text-base capitalize">{t(`agenda.appointmentTypes.${selectedAppointment.type}`)}</p>
                  </div>

                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">{t('agenda.statusType')}</p>
                    <p className={`font-medium text-sm sm:text-base capitalize ${getStatusColor(selectedAppointment.status)} inline-block px-2 py-1 rounded`}>
                      {getStatusText(selectedAppointment.status)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 sm:mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowAppointmentModal(false)}
                    className="px-3 sm:px-4 py-1 sm:py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-xs sm:text-sm"
                  >
                    {t('common.close')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
