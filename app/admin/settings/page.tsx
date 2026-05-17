'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Save, Shield, Trash2, AlertTriangle, Plus, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function AdminSettings() {
  const [settings, setSettings] = useState<any>({});
  const [admins, setAdmins] = useState<any[]>([]);
  const [challengeImageUrl, setChallengeImageUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
    fetchAdmins();
  }, []);

  const fetchSettings = async () => {
    const { data } = await supabase.from('app_settings').select('*');
    const settingsMap = data?.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    setSettings(settingsMap || {});
    setChallengeImageUrl(settingsMap?.challenge_image_url || '');
    setIsLoading(false);
  };

  const fetchAdmins = async () => {
    const { data } = await supabase.from('admin_emails').select('*');
    setAdmins(data || []);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `campaign-${Date.now()}.${fileExt}`;
      
      // Try uploading to 'avatars'
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(fileName, file);

      if (error) {
        // Fallback to 'public' bucket
        const { data: fbData, error: fbError } = await supabase.storage
          .from('public')
          .upload(fileName, file);

        if (fbError) throw fbError;

        const { data: { publicUrl } } = supabase.storage
          .from('public')
          .getPublicUrl(fileName);

        setChallengeImageUrl(publicUrl);
        toast.success("Image uploaded successfully! 📸");
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);

        setChallengeImageUrl(publicUrl);
        toast.success("Image uploaded successfully! 📸");
      }
    } catch (err: any) {
      console.error("Upload failure:", err.message);
      toast.error("Upload failed. You can still paste any direct image link! 🔗");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateSetting = async (e: any) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const updates = Array.from(formData.entries()).map(([key, value]) => ({
      key,
      value: value.toString(),
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase.from('app_settings').upsert(updates);
    if (error) toast.error("Failed to update settings");
    else toast.success("Settings updated! ⚙️");
  };

  const handleAddAdmin = async (e: any) => {
    e.preventDefault();
    const email = new FormData(e.target).get('email') as string;
    const { error } = await supabase.from('admin_emails').insert({ email });
    if (error) toast.error("Failed to add admin or email already exists");
    else {
      toast.success("Admin added");
      fetchAdmins();
      e.target.reset();
    }
  };

  const handleRemoveAdmin = async (id: string) => {
    const { error } = await supabase.from('admin_emails').delete().eq('id', id);
    if (error) toast.error("Failed to remove admin");
    else {
      toast.success("Admin removed");
      fetchAdmins();
    }
  };

  const handleReset = async (type: 'points' | 'streaks') => {
    const confirmText = prompt(`Type "RESET" to confirm resetting ALL ${type}:`);
    if (confirmText !== "RESET") return;

    if (type === 'points') {
      const { error: logErr } = await supabase.from('activity_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const { error: userErr } = await supabase.from('users').update({ total_points: 0 }).neq('id', '00000000-0000-0000-0000-000000000000');
      if (logErr || userErr) toast.error("Reset failed");
      else toast.success("All points and logs reset!");
    } else {
      const { error } = await supabase.from('users').update({ streak_count: 0 }).neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) toast.error("Reset failed");
      else toast.success("All streaks reset!");
    }
  };

  if (isLoading) return <div className="p-10 text-slate-400 font-bold">Loading Settings...</div>;

  return (
    <div className="space-y-12">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-900">Global Settings</h2>
          <p className="text-slate-500 font-bold">Configure challenge rules and point values</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* App Configuration */}
        <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl">
          <div className="flex items-center gap-2 mb-8">
            <Save className="text-indigo-600" size={24} />
            <h3 className="text-xl font-black text-slate-800">Challenge Config</h3>
          </div>
          
          <form onSubmit={handleUpdateSetting} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Challenge Name</label>
                <input name="challenge_title" defaultValue={settings.challenge_title} className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold" required />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Starting Date</label>
                <input name="challenge_start_date" type="date" defaultValue={settings.challenge_start_date} className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold" required />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">End Date</label>
                <input name="challenge_end_date" type="date" defaultValue={settings.challenge_end_date} className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold" required />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Campaign Cover Photo (URL)</label>
                <div className="flex gap-3 items-center">
                  <input 
                    name="challenge_image_url" 
                    type="url"
                    placeholder="https://example.com/image.jpg"
                    value={challengeImageUrl}
                    onChange={(e) => setChallengeImageUrl(e.target.value)}
                    className="flex-1 p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-sm" 
                  />
                  <input 
                    type="file" 
                    id="campaign-image-upload" 
                    accept="image/*" 
                    onChange={handleImageUpload}
                    className="hidden" 
                  />
                  <label 
                    htmlFor="campaign-image-upload" 
                    className="px-5 py-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl font-black cursor-pointer whitespace-nowrap transition-all shadow-sm text-xs uppercase tracking-widest"
                  >
                    {isUploading ? 'Uploading...' : 'Upload File'}
                  </label>
                </div>
                {challengeImageUrl && (
                  <div className="mt-4 flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <img src={challengeImageUrl} alt="Preview" className="w-12 h-12 rounded-full object-cover border-2 border-indigo-100 shadow-sm flex-shrink-0" />
                    <span className="text-xs font-bold text-slate-500 truncate flex-1">{challengeImageUrl}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Hidden safe defaults to prevent blocking the core application logic */}
            <input type="hidden" name="log_cutoff_hour" value={settings.log_cutoff_hour || '21'} />
            <input type="hidden" name="freeze_credits_on_join" value={settings.freeze_credits_on_join || '1'} />
            <input type="hidden" name="points_per_chanting_round" value={settings.points_per_chanting_round || '8'} />
            <input type="hidden" name="points_per_reading_minute" value={settings.points_per_reading_minute || '30'} />
            <input type="hidden" name="points_per_hearing_minute" value="0" />

            <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">
              Save Challenge Settings
            </button>
          </form>
        </section>

        <div className="space-y-10">
          {/* Admin Management */}
          <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl">
            <div className="flex items-center gap-2 mb-8">
              <Shield className="text-emerald-600" size={24} />
              <h3 className="text-xl font-black text-slate-800">Admin Whitelist</h3>
            </div>
            
            <form onSubmit={handleAddAdmin} className="flex gap-2 mb-6">
              <input name="email" type="email" required placeholder="admin@email.com" className="flex-1 p-4 rounded-xl bg-slate-50 border-none outline-none font-bold" />
              <button type="submit" className="px-6 py-4 bg-emerald-600 text-white rounded-xl font-black shadow-lg shadow-emerald-100">
                <Plus size={20} />
              </button>
            </form>

            <div className="space-y-2">
              {admins.map(a => (
                <div key={a.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <span className="font-bold text-slate-700">{a.email}</span>
                  <button onClick={() => handleRemoveAdmin(a.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all"><X size={16} /></button>
                </div>
              ))}
            </div>
          </section>

          {/* Danger Zone */}
          <section className="bg-red-50 rounded-[2.5rem] p-8 border border-red-100 shadow-xl">
            <div className="flex items-center gap-2 mb-6 text-red-600">
              <AlertTriangle size={24} />
              <h3 className="text-xl font-black">Danger Zone</h3>
            </div>
            <p className="text-xs font-bold text-red-500 mb-6 uppercase tracking-widest">Extreme caution required</p>
            
            <div className="space-y-3">
              <button onClick={() => handleReset('points')} className="w-full flex items-center justify-between p-4 bg-white border border-red-200 rounded-2xl text-red-600 font-black hover:bg-red-600 hover:text-white transition-all group">
                Reset All Points & Logs <Trash2 size={18} className="opacity-40 group-hover:opacity-100" />
              </button>
              <button onClick={() => handleReset('streaks')} className="w-full flex items-center justify-between p-4 bg-white border border-red-200 rounded-2xl text-red-600 font-black hover:bg-red-600 hover:text-white transition-all group">
                Reset All Streaks <Trash2 size={18} className="opacity-40 group-hover:opacity-100" />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
