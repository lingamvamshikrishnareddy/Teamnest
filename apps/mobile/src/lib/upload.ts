import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { unwrap } from '@teamnest/api-client';
import { supabase } from './supabase';

export interface PickedFile {
  uri: string;
  mimeType: string;
  name: string;
}

export async function pickPhoto(source: 'camera' | 'library'): Promise<PickedFile | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(source === 'camera' ? 'Camera permission is needed' : 'Photo library permission is needed');
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, exif: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg', name: a.fileName ?? 'photo.jpg' };
}

export async function pickDocument(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, mimeType: a.mimeType ?? 'application/pdf', name: a.name };
}

/**
 * Uploads to Storage under {org}/{user}/{folder}/… (the path the storage
 * policies require) and registers it in public.files. Returns the file id.
 */
export async function uploadFile(
  file: PickedFile,
  opts: { bucket: 'visit-photos' | 'kyc' | 'documents' | 'selfies' | 'avatars'; orgId: string; userId: string; folder: string; entityTable?: string; entityId?: string; sensitive?: boolean },
): Promise<string> {
  const ext = (file.name.split('.').pop() ?? (file.mimeType.includes('pdf') ? 'pdf' : 'jpg')).toLowerCase();
  const path = `${opts.orgId}/${opts.userId}/${opts.folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const body = await (await fetch(file.uri)).arrayBuffer();
  const { error } = await supabase.storage.from(opts.bucket).upload(path, body, { contentType: file.mimeType, upsert: false });
  if (error) throw error;
  const row = unwrap(
    await supabase
      .from('files')
      .insert({ bucket: opts.bucket, path, mime_type: file.mimeType, size_bytes: body.byteLength, owner_user_id: opts.userId, entity_table: opts.entityTable, entity_id: opts.entityId, is_sensitive: !!opts.sensitive })
      .select('id')
      .single(),
  );
  return row.id;
}
