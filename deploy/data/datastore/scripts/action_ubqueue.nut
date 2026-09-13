function define(script)
{
    script.Name = "action_UBQueue";
    script.Type = "ActionCustom";
    return 0;
}

// Queue an Ultimate Battle (or Ultimate Attack) match in a specified global
// zone
// - params[0]: Global zone ID
// - params[1]: Global dynamic map ID
// - params[2]: Optional Ultimate Attack specifier if "UA"
function run(source, cState, dState, zone, server, params)
{
    if(params.len() < 2)
    {
        return Result_t.FAIL;
    }

    local gZone = server.GetZoneManager().GetGlobalZone(params[0].tointeger(),
        params[1].tointeger());

    local match = UBMatch();
    if(params.len() == 3 && params[2] == "UA")
    {
        match.Category = UBMatch_Category_t.UA;
        match.SetSubType(5);
        match.SetQueueDuration(5);
        match.SetReadyDuration(300);
        match.SetMemberLimit(15);
        match.SetSpectatorLimit(0);
    }
    else
    {
        match.SetQueueDuration(10);
        match.SetAnnounceDuration(10);
        match.SetReadyDuration(300);
        match.SetDarkLimit(400000);
        match.SetGaugeDecay(5000);
        match.SetGaugeScale(10.0);
        match.SetGaugeDecayScale(1.75);
        match.SetMemberLimit(5);
        match.SetSpectatorLimit(50);
    }

    return server.GetMatchManager().StartStopMatch(gZone, match)
        ? Result_t.SUCCESS : Result_t.FAIL;
}