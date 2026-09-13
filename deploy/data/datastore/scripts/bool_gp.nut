function define(script)
{
    script.Name = "bool_gp";
    script.Type = "EventCondition";
    return 0;
}

// Check if a character is at or above a specified PvP GP
// - value1: GP amount
function check(source, cState, dState, zone, value1, value2, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    if(character != null)
    {
        local pvp = character.GetPvPData().Get();
        return pvp != null && pvp.GetGP() >= value1 ? 0 : -1;
    }

    return -1;
}