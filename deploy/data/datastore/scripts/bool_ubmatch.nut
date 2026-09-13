function define(script)
{
    script.Name = "bool_ubMatch";
    script.Type = "EventCondition";
    return 0;
}

// Check if an UB/UA match exists in the current zone.
function check(source, cState, dState, zone, value1, value2, params)
{
    local ubMatch = zone != null ? zone.GetUBMatch() : null;
    if(ubMatch != null)
    {
        if(ubMatch.Category == UBMatch_Category_t.UB &&
            ubMatch.State == UBMatch_State_t.PREMATCH)
        {
            return 0;
        }
        else if(ubMatch.Category == UBMatch_Category_t.UA &&
            ubMatch.State == UBMatch_State_t.READY)
        {
            return 0;
        }
    }

    return -1;
}