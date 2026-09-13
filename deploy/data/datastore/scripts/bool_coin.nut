function define(script)
{
    script.Name = "bool_coin";
    script.Type = "EventCondition";
    return 0;
}

// Check if the current character has at least the supplied number of coins
// - value1: Amount of coins.
function check(source, cState, dState, zone, value1, value2, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    local progress = character != null ? character.GetProgress().Get() : null;
    return progress != null && progress.GetCoins() >= value1 ? 0 : -1;
}