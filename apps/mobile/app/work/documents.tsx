import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, FileText, FolderLock, Lock, Upload } from 'lucide-react-native';
import { listDocumentCategories, listMyDocuments, signedFileUrl, toAppError } from '@teamnest/api-client';
import { formatDate } from '@teamnest/ui';
import { Badge, type BadgeTone } from '@/components/badge';
import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Header } from '@/components/header';
import { Sheet } from '@/components/sheet';
import { Loading } from '@/components/states';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';
import { pickDocument, pickPhoto, uploadFile } from '@/lib/upload';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

const TONE: Record<string, BadgeTone> = { pending: 'warning', verified: 'success', rejected: 'danger', expired: 'neutral' };

export default function Documents() {
  const { context } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const userId = context?.user.id ?? '';
  const cats = useQuery({ queryKey: ['doc-cats', 'employee'], queryFn: () => listDocumentCategories(supabase, 'employee') });
  const docs = useQuery({ queryKey: ['my-docs', userId], queryFn: () => listMyDocuments(supabase, userId), enabled: !!userId });
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (source: 'camera' | 'file') => {
      const c = cats.data?.find((x) => x.id === cat);
      if (!c) throw new Error('Pick a category');
      const file = source === 'file' ? await pickDocument() : await pickPhoto('camera');
      if (!file) return false;
      const fileId = await uploadFile(file, { bucket: 'documents', orgId: context!.user.org_id, userId, folder: 'vault', entityTable: 'users', entityId: userId, sensitive: c.is_sensitive });
      const { error } = await supabase.from('documents').insert({ category_id: c.id, owner_user_id: userId, title: file.name || c.name, file_id: fileId });
      if (error) throw error;
      return true;
    },
    onSuccess: (ok) => { if (ok) { qc.invalidateQueries({ queryKey: ['my-docs'] }); setOpen(false); } },
    onError: (e) => Alert.alert('Upload failed', e instanceof Error && !('code' in e) ? e.message : toAppError(e).message),
  });

  const view = async (fileId: string | null) => {
    if (!fileId) return Alert.alert('No file', 'This record has no attached file yet.');
    try { await Linking.openURL(await signedFileUrl(supabase, fileId)); } catch (e) { Alert.alert('Could not open', toAppError(e).message); }
  };

  if (cats.isLoading || docs.isLoading) return <View className="flex-1 bg-background"><Header title={t('work.documents')} /><Loading /></View>;

  return (
    <View className="flex-1 bg-background">
      <Header title={t('work.documents')} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-32">
        {(cats.data ?? []).map((c) => {
          const items = (docs.data ?? []).filter((d) => d.category_id === c.id);
          return (
            <View key={c.id} className="gap-2">
              <View className="flex-row items-center gap-2">
                <FolderLock size={16} color={colors.primaryText} />
                <Text weight="semibold" className="flex-1">{c.name}</Text>
                {c.is_sensitive ? <Lock size={14} color={colors.textSubtle} /> : null}
                {c.is_mandatory && !items.length ? <Badge label="Required" tone="danger" /> : null}
              </View>
              {items.length ? items.map((d) => (
                <Pressable key={d.id} onPress={() => view(d.file_id)} className="flex-row items-center gap-3 rounded-card bg-surface p-3" accessibilityRole="button">
                  <FileText size={18} color={colors.textMuted} />
                  <View className="flex-1">
                    <Text className="text-sm" numberOfLines={1}>{d.title}</Text>
                    <Text className="text-xs text-text-muted">{formatDate(d.created_at)}{d.rejection_reason ? ` · ${d.rejection_reason}` : ''}</Text>
                  </View>
                  <Badge label={d.status} tone={TONE[d.status] ?? 'neutral'} />
                </Pressable>
              )) : <Text className="pl-6 text-sm text-text-subtle">Nothing uploaded</Text>}
            </View>
          );
        })}
      </ScrollView>
      <View className="absolute bottom-0 left-0 right-0 border-t border-border bg-surface px-4 pb-8 pt-3">
        <Button label="Upload document" icon={<Upload size={18} color={colors.onPrimary} />} onPress={() => setOpen(true)} />
      </View>
      <Sheet visible={open} title="Upload to your vault" onClose={() => setOpen(false)}>
        <View className="flex-row flex-wrap gap-2">
          {(cats.data ?? []).map((c) => <Chip key={c.id} label={c.name} active={cat === c.id} onPress={() => setCat(c.id)} />)}
        </View>
        <Button label="Take photo" icon={<Camera size={16} color={colors.onPrimary} />} disabled={!cat} loading={upload.isPending && upload.variables === 'camera'} onPress={() => upload.mutate('camera')} />
        <Button label="Pick PDF or image" variant="outline" disabled={!cat} loading={upload.isPending && upload.variables === 'file'} onPress={() => upload.mutate('file')} />
        <Text className="text-xs text-text-muted">Only you and HR can see your documents.</Text>
      </Sheet>
    </View>
  );
}
