function define(script)
{
    script.Name = "bool_cultureActive";
    script.Type = "EventCondition";
    return 0;
}

// Check if the current character has active (or pending pickup) culture items
// - value1: If 1, check if the cultiure item pending pickup, otherwise check
//   if an active item exists
function check(source, cState, dState, zone, value1, value2, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    if(character == null)
    {
        return -1;
    }

    local culture = character.GetCultureData().Get();
    if(culture == null)
    {
        return -1;
    }

    if(value1 == 1)
    {
        if(!culture.GetItem().IsNull() && !culture.GetActive())
        {
            return 0;
        }
    }
    else
    {
        if(culture.GetActive())
        {
            return 0;
        }
    }

    return -1;
}