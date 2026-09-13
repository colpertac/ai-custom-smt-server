function define(script)
{
    script.Name = "action_UBMatchStatus";
    script.Type = "ActionCustom";
    return 0;
}

// Pull the current UB or UA match from a global zone on the same channel and
// report information about it for use in the events.
// - params[0]: ID of the zone to look for the match in
// - params[1]: Dynamic map ID of the zone to look for the match in
// - params[2]+: First character flag to write the results to. Results written
//   are as follows:
//   params[2] + 0: Numeric match state, -1 if none exists
//   params[2] + 1: Number of current member IDs
//   params[2] + 2: Number of current member IDs remaining
//   params[2] + 3: Number of current spectator IDs
//   params[2] + 4: Number of current spectator IDs remaining
//   params[2] + 5: 1 if the character is a member, 2 if the character is a
//                  spectator, 0 if they are neither
function run(source, cState, dState, zone, server, params)
{
    if(params.len() < 3 || zone == null || cState == null)
    {
        return Result_t.FAIL;
    }

    local cid = cState.GetWorldCID();
    local flag1 = params[2].tointeger();
    local flag2 = flag1 + 1;
    local flag3 = flag1 + 2;
    local flag4 = flag1 + 3;
    local flag5 = flag1 + 4;
    local flag6 = flag1 + 5;

    local gZone = server.GetZoneManager().GetGlobalZone(params[0].tointeger(),
        params[1].tointeger());
    local ubMatch = gZone != null ? gZone.GetUBMatch() : null;
    if(ubMatch == null)
    {
        zone.SetFlagState(flag1, -1, cid);
        zone.SetFlagState(flag2, 0, cid);
        zone.SetFlagState(flag3, 0, cid);
        zone.SetFlagState(flag4, 0, cid);
        zone.SetFlagState(flag5, 0, cid);
        zone.SetFlagState(flag6, 0, cid);

        return Result_t.SUCCESS;
    }

    zone.SetFlagState(flag1, ubMatch.State, cid);
    zone.SetFlagState(flag2, ubMatch.MemberIDsCount(), cid);
    zone.SetFlagState(flag3, ubMatch.GetMemberLimit() - ubMatch.MemberIDsCount(), cid);
    zone.SetFlagState(flag4, ubMatch.SpectatorIDsCount(), cid);
    zone.SetFlagState(flag5, ubMatch.GetSpectatorLimit() - ubMatch.SpectatorIDsCount(), cid);

    if(ubMatch.MemberIDsContains(cid))
    {
        zone.SetFlagState(flag6, 1, cid);
    }
    else if(ubMatch.SpectatorIDsContains(cid))
    {
        zone.SetFlagState(flag6, 2, cid);
    }
    else
    {
        zone.SetFlagState(flag6, 0, cid);
    }

    return Result_t.SUCCESS;
}