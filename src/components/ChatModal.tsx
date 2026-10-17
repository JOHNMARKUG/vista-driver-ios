import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../lib/theme';

// Native port of the web driver app's RideChat.jsx — same ride_messages
// schema (booking_id, booking_type, sender_id, sender_type, message,
// read_at), same quick-reply set, same realtime subscribe-on-open pattern.
const SUPPORT_WHATSAPP = '256785585703';
const SUPPORT_DISPLAY = '+256 785 585703';
const MAX_MESSAGE_LENGTH = 500;

const QUICK_REPLIES = [
  'I am on my way 🚗',
  'I have arrived 📍',
  'Please come outside 🚪',
  'I am stuck in traffic ⏳',
  'I cannot find you. Please call me 📞',
];

type Message = {
  id: string;
  booking_id: string;
  booking_type: string;
  sender_id: string;
  sender_type: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

type Props = {
  visible: boolean;
  bookingId: string | null;
  bookingType: 'booking' | 'vista_ride';
  otherPartyName?: string | null;
  onClose: () => void;
};

export default function ChatModal({ visible, bookingId, bookingType, otherPartyName, onClose }: Props) {
  const { driver } = useAuth();
  const userId = driver?.user_id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const markAsRead = async () => {
    if (!bookingId || !userId) return;
    await supabase.from('ride_messages').update({ read_at: new Date().toISOString() }).eq('booking_id', bookingId).neq('sender_type', 'driver').is('read_at', null);
  };

  const fetchMessages = async () => {
    if (!bookingId) return;
    const { data } = await supabase.from('ride_messages').select('*').eq('booking_id', bookingId).eq('booking_type', bookingType).order('created_at', { ascending: true });
    if (data) setMessages(data as Message[]);
  };

  useEffect(() => {
    if (!visible || !bookingId || !userId) return;
    fetchMessages();
    markAsRead();

    const channel = supabase
      .channel(`driver-chat-${bookingId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_messages', filter: `booking_id=eq.${bookingId}` }, (payload) => {
        const row = payload.new as Message;
        setMessages((prev) => [...prev, row]);
        if (row.sender_type !== 'driver') markAsRead();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, bookingId, userId]);

  const sendMessage = async (msg = text.trim()) => {
    if (!msg || !userId || !bookingId || sending) return;
    setSending(true);
    const { error } = await supabase.from('ride_messages').insert({
      booking_id: bookingId,
      booking_type: bookingType,
      sender_id: userId,
      sender_type: 'driver',
      message: msg,
    });
    if (!error) setText('');
    setSending(false);
  };

  // Guideline 1.2: a way to report abusive messages. Opens a pre-filled message
  // to VISTA support (the same channel as the SOS button) with the trip and the
  // passenger's latest messages, so dispatch can review and act on the account.
  const reportConversation = () => {
    Alert.alert(
      'Report this conversation?',
      'Use this for abusive, threatening or unsafe messages. VISTA support will review the conversation and can suspend the passenger from the service.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report to VISTA support',
          style: 'destructive',
          onPress: () => {
            const recent = messages
              .filter((m) => m.sender_type !== 'driver')
              .slice(-5)
              .map((m) => `- "${m.message}"`)
              .join('\n');
            const msg = `REPORT: abusive or unsafe chat message\nDriver: ${driver?.full_name ?? 'N/A'}\nTrip: ${bookingType} ${bookingId}\nRecent passenger messages:\n${recent || '(none)'}`;
            Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(msg)}`);
          },
        },
      ],
    );
  };

  const fmt = (ts: string) => new Date(ts).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F6F9' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Header */}
          <View style={{ backgroundColor: colors.navy, paddingHorizontal: spacing.md, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable onPress={onClose} style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>{otherPartyName ?? 'Passenger'}</Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>🔒 Passenger number stays private</Text>
            </View>
            <Pressable
              onPress={reportConversation}
              accessibilityRole="button"
              accessibilityLabel="Report this conversation"
              style={{ backgroundColor: 'rgba(220,38,38,0.2)', borderRadius: 10, height: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Ionicons name="flag" size={15} color="#FCA5A5" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FCA5A5' }}>Report</Text>
            </Pressable>
          </View>

          {/* Quick replies */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E8EDF5' }} contentContainerStyle={{ padding: 10, gap: 6 }}>
            {QUICK_REPLIES.map((qr) => (
              <Pressable key={qr} onPress={() => sendMessage(qr)} disabled={sending} style={{ backgroundColor: '#F4F6F9', borderWidth: 1.5, borderColor: '#E8EDF5', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.navy }}>{qr}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Messages */}
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
            {messages.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
                <Text style={{ fontSize: 32, marginBottom: 12 }}>💬</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.navy, marginBottom: 6 }}>Chat with your passenger</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 }}>Use quick replies or type a message — their number stays private</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, textAlign: 'center', lineHeight: 17, marginTop: 14 }}>
                  Abusive or unsafe message? Tap Report, or contact VISTA support on {SUPPORT_DISPLAY}.
                </Text>
              </View>
            )}
            {messages.map((msg) => {
              const isMe = msg.sender_type === 'driver';
              return (
                <View key={msg.id} style={{ flexDirection: 'row', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                  <View style={{ maxWidth: '75%' }}>
                    <View
                      style={{
                        backgroundColor: isMe ? colors.gold : colors.navy,
                        borderRadius: 16,
                        borderBottomRightRadius: isMe ? 4 : 16,
                        borderBottomLeftRadius: isMe ? 16 : 4,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 20 }}>{msg.message}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4, textAlign: isMe ? 'right' : 'left' }}>
                      {fmt(msg.created_at)}{isMe && msg.read_at ? ' ✓✓' : isMe ? ' ✓' : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Input */}
          <View style={{ backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E8EDF5', padding: 12, flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Message your passenger..."
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
              style={{ flex: 1, backgroundColor: '#F4F6F9', borderWidth: 1.5, borderColor: '#E8EDF5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 11, fontSize: 14, color: colors.navy, maxHeight: 100 }}
            />
            <Pressable
              onPress={() => sendMessage()}
              disabled={!text.trim() || sending}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? colors.gold : '#E8EDF5', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="send" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
