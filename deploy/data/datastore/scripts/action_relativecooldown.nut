function define(script)
{
    script.Name = "action_relativeCooldown";
    script.Type = "ActionCustom";
    return 0;
}

// Calculate and set a relative cooldown on the current character
// - params[0]: Cooldown ID
// - params[1]: System hour to expire
// - params[2]: System minute to expire
// - params[3]: Optional number of days to offset
function run(source, cState, dState, zone, server, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    if(params.len() < 3 || character == null)
    {
        return Result_t.FAIL;
    }

    local cooldownID = params[0].tointeger();
    local toHour = params[1].tointeger();
    local toMin = params[2].tointeger();
    local toMerge = toHour * 60 + toMin;

    local clock = server.GetWorldClockTime();
    local now = clock.SystemTime;
    local fromMerge = clock.SystemHour * 60 + clock.SystemMin;

    local timeDelta = 0;
    if(fromMerge < toMerge)
    {
        timeDelta = (toMerge - fromMerge) * 60;
    }
    else
    {
        timeDelta = 86400 -
            (((clock.SystemHour * 60) + clock.SystemMin) * 60) +
            (((toHour * 60) + toMin) * 60);
    }

    if(params.len() >= 4)
    {
        // Add day offset
        timeDelta = timeDelta + 86400 * params[3].tointeger();
    }

    character.SetActionCooldownsEntry(cooldownID, now + timeDelta);

    return Result_t.SUCCESS;
}