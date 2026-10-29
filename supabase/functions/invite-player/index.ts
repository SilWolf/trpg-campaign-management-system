// supabase/functions/invite-player/index.ts
/* global Deno */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 定義共用的 CORS Headers
const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers':
		'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
	// 1. 處理瀏覽器的 OPTIONS 預檢請求 (Preflight)
	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders });
	}

	try {
		const { email, campaignId } = await req.json();
		if (
			typeof email !== 'string' ||
			!email.trim() ||
			typeof campaignId !== 'string' ||
			!campaignId.trim()
		) {
			throw new Error('請提供有效的電子郵件與戰役 ID。');
		}

		const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
		const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
		const authorization = req.headers.get('Authorization');
		if (!authorization) {
			throw new Error('請先登入後再發送邀請。');
		}

		const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
			global: { headers: { Authorization: authorization } },
		});
		const {
			data: { user },
			error: userError,
		} = await supabaseClient.auth.getUser();
		if (userError || !user) {
			throw new Error('登入狀態無效，請重新登入後再試。');
		}

		const supabaseAdmin = createClient(
			supabaseUrl,
			Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
			{ auth: { persistSession: false } },
		);

		const { data: dmMembership, error: membershipError } = await supabaseAdmin
			.from('campaign_members')
			.select('user_id')
			.eq('campaign_id', campaignId)
			.eq('user_id', user.id)
			.eq('role', 'dm')
			.maybeSingle();
		if (membershipError) throw membershipError;
		if (!dmMembership) {
			throw new Error('只有該戰役的 DM 可以發送邀請。');
		}

		const { data: userData, error: inviteError } =
			await supabaseAdmin.auth.admin.inviteUserByEmail(email.trim(), {
				redirectTo: `${req.headers.get('origin')}/invite/${encodeURIComponent(campaignId)}`,
			});

		if (inviteError) throw inviteError;

		if (userData.user) {
			const { error: memberError } = await supabaseAdmin
				.from('campaign_members')
				.upsert(
					{
						campaign_id: campaignId,
						user_id: userData.user.id,
						role: 'player',
						invited_at: new Date().toISOString(),
						accepted_at: null,
					},
					{ onConflict: 'campaign_id, user_id' },
				);
			if (memberError) throw memberError;
		}

		return new Response(
			JSON.stringify({ success: true, user: userData.user }),
			{
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				status: 200,
			},
		);
	} catch (error) {
		return new Response(JSON.stringify({ error: error.message }), {
			headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			status: 400,
		});
	}
});
