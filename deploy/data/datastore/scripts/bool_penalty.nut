function define(script)
{
    script.Name = "bool_penalty";
    script.Type = "EventCondition";
    return 0;
}

// Check if a character has too many pvp-related penalties.
// - value1: number of penalties, should be 3 by default.
function check(source, cState, dState, zone, value1, value2, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    if(character != null)
    {
        local pvp = character.GetPvPData().Get();
        return pvp != null && pvp.GetPenaltyCount() >= value1 ? 0 : -1;
    }

    return -1;
}